import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('confidence')

  if (!data) return NextResponse.json({ total: 0, high: 0, low: 0, avg: 0 })

  const total = data.length
  const high = data.filter(d => (d.confidence as number) >= 90).length
  const low = data.filter(d => (d.confidence as number) < 70).length
  const avg = total > 0
    ? Math.round(data.reduce((a, d) => a + (d.confidence as number), 0) / total)
    : 0

  return NextResponse.json({ total, high, low, avg })
}
