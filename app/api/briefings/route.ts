import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams
    const reportType = params.get('report_type')
    const status = params.get('status')
    const cluster = params.get('cluster')
    const dateFrom = params.get('date_from')
    const dateTo = params.get('date_to')
    const limit = parseInt(params.get('limit') ?? '50')
    const cursor = params.get('cursor')

    let query = supabaseAdmin
      .from('briefing_reports')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(Math.min(limit, 200))

    if (reportType) query = query.eq('report_type', reportType)
    if (status) query = query.eq('status', status)
    if (cluster) query = query.eq('cluster', cluster)
    if (dateFrom) query = query.gte('created_at', dateFrom)
    if (dateTo) query = query.lte('created_at', dateTo)
    if (cursor) query = query.lt('created_at', cursor)

    const { data, count, error } = await query
    if (error) throw new Error(error.message)

    const reports = data ?? []
    const nextCursor = reports.length > 0 ? reports[reports.length - 1].created_at : null

    return NextResponse.json({ ok: true, reports, total: count ?? 0, next_cursor: nextCursor })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { report_type, cluster } = body

    if (!report_type) return NextResponse.json({ error: 'Missing report_type' }, { status: 400 })

    // Trigger generation based on type
    let reportId: string

    switch (report_type) {
      case 'STANDUP_BRIEF': {
        if (!cluster) return NextResponse.json({ error: 'cluster required for STANDUP_BRIEF' }, { status: 400 })
        const { data: clusterData } = await supabaseAdmin.from('cluster_health_cache').select('chat_id').eq('cluster', cluster).single()
        if (!clusterData) return NextResponse.json({ error: `Cluster ${cluster} not found` }, { status: 404 })
        const { generateClusterBrief } = await import('@/lib/briefings/pre-standup')
        const { generateReport } = await import('@/lib/briefings/report-generator')
        const { textSummary } = await generateClusterBrief(cluster, clusterData.chat_id)
        const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''
        reportId = await generateReport({
          report_type: 'STANDUP_BRIEF',
          report_name: `Pre-Standup Brief — ${cluster}`,
          cluster,
          scheduled_for: new Date(),
          content: textSummary,
          generation_log: { sources_read: [], ai_reasoning: 'On-demand generation', processing_start: new Date().toISOString(), processing_end: new Date().toISOString(), duration_seconds: 0, tokens_used: 0, model: 'claude-sonnet-4-6', errors: [] },
          destinations: [
            { chat_id: clusterData.chat_id, name: `${cluster} Group`, type: 'cluster_group', selected: true },
            ...(LEE_OPEN_ID ? [{ chat_id: LEE_OPEN_ID, name: 'Lee DM', type: 'lee_dm' as const, selected: false }] : []),
          ],
        })
        break
      }
      case 'MORNING_BRIEF': {
        const { generateMorningBriefContent } = await import('@/lib/briefings/morning')
        const { generateReport } = await import('@/lib/briefings/report-generator')
        const { content, log, destinations } = await generateMorningBriefContent()
        reportId = await generateReport({
          report_type: 'MORNING_BRIEF',
          report_name: 'Morning Intelligence Briefing',
          scheduled_for: new Date(),
          content,
          generation_log: log,
          destinations,
        })
        break
      }
      default: {
        // Generic report generation — create a stub
        const { generateReport } = await import('@/lib/briefings/report-generator')
        reportId = await generateReport({
          report_type,
          report_name: report_type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          cluster: cluster ?? undefined,
          scheduled_for: new Date(),
          content: `[${report_type}] Report generation not yet implemented. Placeholder created.`,
          generation_log: { sources_read: [], ai_reasoning: 'Placeholder', processing_start: new Date().toISOString(), processing_end: new Date().toISOString(), duration_seconds: 0, tokens_used: 0, model: 'claude-sonnet-4-6', errors: [] },
          destinations: [],
        })
      }
    }

    return NextResponse.json({ ok: true, report_id: reportId })
  } catch (error) {
    console.error('[api:briefings]', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
