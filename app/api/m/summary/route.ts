import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const [p1, awaiting, resolvedToday, clusters, drafts] = await Promise.all([
      supabaseAdmin.from('incidents').select('*').eq('priority', 'P1').in('status', ['new', 'analysed', 'awaiting_lee', 'acting']).order('created_at', { ascending: false }).limit(5),
      supabaseAdmin.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['awaiting_lee']),
      supabaseAdmin.from('incidents').select('id', { count: 'exact', head: true }).eq('status', 'resolved').gte('resolved_at', new Date(new Date().setHours(0, 0, 0, 0)).toISOString()),
      supabaseAdmin.from('cluster_health_cache').select('cluster, health_status').order('cluster', { ascending: true }),
      supabaseAdmin.from('briefing_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
    ])

    return NextResponse.json({
      ok: true,
      p1_incidents: p1.data ?? [],
      p1_count: (p1.data ?? []).length,
      awaiting_count: awaiting.count ?? 0,
      resolved_today: resolvedToday.count ?? 0,
      cluster_summary: (clusters.data ?? []).map((c: Record<string, unknown>) => ({ cluster: c.cluster, status: c.health_status })),
      draft_reports_count: drafts.count ?? 0,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
