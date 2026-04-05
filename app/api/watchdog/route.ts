import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const eventType = req.nextUrl.searchParams.get('event_type')
    const cluster = req.nextUrl.searchParams.get('cluster')
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100')

    let query = supabaseAdmin.from('nucleus_activity_log').select('*').order('created_at', { ascending: false }).limit(Math.min(limit, 500))

    if (eventType) query = query.eq('event_type', eventType)
    if (cluster) query = query.eq('cluster', cluster)

    const { data: events } = await query

    // Stats
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: todayEvents } = await supabaseAdmin.from('nucleus_activity_log').select('event_type, success').gte('created_at', today.toISOString())

    const byType: Record<string, number> = {}
    let errorsToday = 0
    for (const e of todayEvents ?? []) {
      byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
      if (e.event_type === 'ERROR') errorsToday++
    }

    return NextResponse.json({
      ok: true,
      events: events ?? [],
      stats: {
        total: (todayEvents ?? []).length,
        by_type: byType,
        errors_today: errorsToday,
      },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
