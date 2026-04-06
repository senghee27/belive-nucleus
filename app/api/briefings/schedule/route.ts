import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data: configs, error } = await supabaseAdmin
      .from('briefing_schedule_config')
      .select('*')
      .order('report_type', { ascending: true })

    if (error) throw new Error(error.message)

    // Get last cron run per type
    const { data: lastRuns } = await supabaseAdmin
      .from('briefing_cron_runs')
      .select('report_type, cluster, status, started_at, completed_at, duration_seconds, error_message, report_id')
      .order('started_at', { ascending: false })
      .limit(100)

    // Get last 7 runs per type for dots
    const { data: recentRuns } = await supabaseAdmin
      .from('briefing_cron_runs')
      .select('report_type, cluster, status, started_at, duration_seconds')
      .order('started_at', { ascending: false })
      .limit(200)

    // Group by category
    const grouped: Record<string, typeof configs> = { daily: [], cluster: [], management: [], on_demand: [] }
    for (const c of configs ?? []) {
      const cat = c.category as string
      if (grouped[cat]) grouped[cat].push(c)
    }

    // Attach recent runs to each config
    const enriched = (configs ?? []).map(c => {
      const typeRuns = (recentRuns ?? []).filter(r => r.report_type === c.report_type)
      const last7 = typeRuns.slice(0, 7)
      return { ...c, recent_runs: last7 }
    })

    // Stats
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: todayRuns } = await supabaseAdmin
      .from('briefing_cron_runs')
      .select('status')
      .gte('started_at', today.toISOString())

    const running = (todayRuns ?? []).filter(r => r.status === 'running').length
    const failedToday = (todayRuns ?? []).filter(r => r.status === 'failed').length
    const scheduledTypes = (configs ?? []).filter(c => c.cron_expression && c.enabled).length

    // 7-day success rate
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString()
    const { data: weekRuns } = await supabaseAdmin
      .from('briefing_cron_runs')
      .select('status')
      .gte('started_at', weekAgo)
      .in('status', ['success', 'failed'])

    const weekTotal = (weekRuns ?? []).length
    const weekSuccess = (weekRuns ?? []).filter(r => r.status === 'success').length
    const weekRate = weekTotal > 0 ? Math.round((weekSuccess / weekTotal) * 100) : 100

    return NextResponse.json({
      ok: true,
      configs: enriched,
      grouped,
      stats: { scheduled_types: scheduledTypes, running, failed_today: failedToday, success_rate_7d: weekRate },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
