import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const body = await req.json().catch(() => ({}))
    const cluster = body.cluster as string | undefined
    const triggeredByUser = body.triggered_by_user as string | undefined

    // Run generation async — return immediately
    after(async () => {
      try {
        switch (type) {
          case 'MORNING_BRIEF': {
            const { sendMorningBriefings } = await import('@/lib/briefings/morning')
            await sendMorningBriefings('manual', triggeredByUser)
            break
          }
          case 'STANDUP_BRIEF': {
            const { sendMorningBriefs } = await import('@/lib/briefings/pre-standup')
            const targetClusters = cluster ? [cluster] : undefined
            await sendMorningBriefs(targetClusters, undefined, 'manual', triggeredByUser)
            break
          }
          case 'EOD_SUMMARY': {
            const { sendEveningOCCs } = await import('@/lib/briefings/evening-occ')
            const targetClusters = cluster ? [cluster] : undefined
            await sendEveningOCCs(targetClusters, undefined, 'manual', triggeredByUser)
            break
          }
          case 'MIDDAY_PULSE': {
            const { runMiddayScan, runAllMiddayScans } = await import('@/lib/briefings/midday')
            if (cluster) {
              await runMiddayScan(cluster, 'manual', triggeredByUser)
            } else {
              await runAllMiddayScans()
            }
            break
          }
          case 'COMPLIANCE_ALERT': {
            const { checkAndRemindNonCompliant } = await import('@/lib/briefings/compliance')
            await checkAndRemindNonCompliant('manual', triggeredByUser)
            break
          }
          default: {
            // On-demand or unimplemented — create via briefings API
            const { generateReport } = await import('@/lib/briefings/report-generator')
            const { startCronRun, completeCronRun } = await import('@/lib/briefings/cron-logger')
            const runId = await startCronRun({ report_type: type, cluster, triggered_by: 'manual', triggered_by_user: triggeredByUser })
            try {
              const reportId = await generateReport({
                report_type: type,
                report_name: type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
                cluster,
                scheduled_for: new Date(),
                content: `[${type}] Report generation not yet implemented.`,
                generation_log: { sources_read: [], ai_reasoning: 'Placeholder', processing_start: new Date().toISOString(), processing_end: new Date().toISOString(), duration_seconds: 0, tokens_used: 0, model: 'n/a', errors: [] },
                destinations: [],
              })
              await completeCronRun(runId, { status: 'success', report_id: reportId })
            } catch (err) {
              await completeCronRun(runId, { status: 'failed', error_message: err instanceof Error ? err.message : 'Unknown' })
            }
          }
        }
      } catch (error) {
        console.error(`[schedule:run:${type}]`, error instanceof Error ? error.message : 'Unknown')
      }
    })

    return NextResponse.json({ ok: true, message: 'Generation started', report_type: type })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
