import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { after } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const body = await req.json().catch(() => ({}))
    const cluster = body.cluster as string | undefined

    // Find most recent failed run
    let query = supabaseAdmin
      .from('briefing_cron_runs')
      .select('id, retry_count')
      .eq('report_type', type)
      .eq('status', 'failed')
      .order('started_at', { ascending: false })
      .limit(1)

    if (cluster) query = query.eq('cluster', cluster)

    const { data: failedRuns } = await query
    const failedRun = failedRuns?.[0]

    if (failedRun) {
      await supabaseAdmin
        .from('briefing_cron_runs')
        .update({ retry_count: ((failedRun.retry_count as number) ?? 0) + 1 })
        .eq('id', failedRun.id)
    }

    // Trigger a new run as retry
    after(async () => {
      try {
        const runUrl = new URL(req.url)
        runUrl.pathname = runUrl.pathname.replace('/retry', '/run')
        await fetch(runUrl.toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cluster, triggered_by_user: 'Lee Seng Hee (retry)' }),
        })
      } catch (error) {
        console.error(`[schedule:retry:${type}]`, error instanceof Error ? error.message : 'Unknown')
      }
    })

    return NextResponse.json({ ok: true, message: 'Retry started', report_type: type })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
