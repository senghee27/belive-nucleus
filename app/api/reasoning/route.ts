import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const step = url.searchParams.get('step')
  const band = url.searchParams.get('band')
  const category = url.searchParams.get('category')
  const cluster = url.searchParams.get('cluster')
  const limitParam = parseInt(url.searchParams.get('limit') ?? '50', 10)
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 500) : 50

  let q = supabaseAdmin
    .from('incident_reasoning_traces')
    .select(`
      *,
      incidents!inner (id, title, cluster, category, severity, priority, created_at)
    `)
    .order('confidence', { ascending: true })
    .limit(limit)

  if (step) q = q.eq('step_name', step)
  if (band === 'low') q = q.lt('confidence', 70)
  else if (band === 'mid') q = q.gte('confidence', 70).lt('confidence', 90)
  else if (band === 'high') q = q.gte('confidence', 90)
  if (category) q = q.eq('incidents.category', category)
  if (cluster) q = q.eq('incidents.cluster', cluster)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ traces: data ?? [] })
}
