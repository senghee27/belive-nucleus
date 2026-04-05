import { NextRequest, NextResponse } from 'next/server'
import { checkSilenceAndEscalate } from '@/lib/incidents'

// Main cron — handles all scheduled tasks based on current MYT time
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const myt = new Date(Date.now() + 8 * 3600000)
    const hour = myt.getUTCHours()
    const minute = myt.getUTCMinutes()
    const results: Record<string, unknown> = { time_myt: `${hour}:${String(minute).padStart(2, '0')}` }

    // 8:30am MYT — Morning briefs
    if (hour === 8 && minute >= 25 && minute <= 35) {
      const { sendMorningBriefs } = await import('@/lib/briefings/pre-standup')
      results.morning = await sendMorningBriefs()
    }

    // 10:00am MYT — Compliance reminder
    if (hour === 10 && minute >= 0 && minute <= 5) {
      const { checkAndRemindNonCompliant } = await import('@/lib/briefings/compliance')
      results.compliance = await checkAndRemindNonCompliant()
    }

    // 11:00am MYT — Non-compliance incidents
    if (hour === 11 && minute >= 0 && minute <= 5) {
      const { createNonComplianceIncidents } = await import('@/lib/briefings/compliance')
      results.incidents = await createNonComplianceIncidents()
    }

    // 12:00pm MYT — Midday scan
    if (hour === 12 && minute >= 0 && minute <= 5) {
      const { runAllMiddayScans } = await import('@/lib/briefings/midday')
      await runAllMiddayScans()
      results.midday = 'completed'
    }

    // 10:15pm MYT — Evening OCC
    if (hour === 22 && minute >= 10 && minute <= 20) {
      const { sendEveningOCCs } = await import('@/lib/briefings/evening-occ')
      results.evening = await sendEveningOCCs()
    }

    // Always — Silence and escalation checks
    results.escalations = await checkSilenceAndEscalate()

    // Compute cluster health
    const { computeAllClusters } = await import('@/lib/cluster-health')
    await computeAllClusters()
    results.health = 'recomputed'

    return NextResponse.json({ ok: true, ...results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

// Manual task trigger
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const task = (body as Record<string, string>).task ?? 'check-escalations'

    if (task === 'morning-briefing') {
      const { sendMorningBriefs } = await import('@/lib/briefings/pre-standup')
      return NextResponse.json({ ok: true, task, result: await sendMorningBriefs() })
    }
    if (task === 'evening-occ') {
      const { sendEveningOCCs } = await import('@/lib/briefings/evening-occ')
      return NextResponse.json({ ok: true, task, result: await sendEveningOCCs() })
    }
    if (task === 'check-compliance') {
      const { checkAndRemindNonCompliant } = await import('@/lib/briefings/compliance')
      return NextResponse.json({ ok: true, task, result: await checkAndRemindNonCompliant() })
    }
    if (task === 'create-incidents') {
      const { createNonComplianceIncidents } = await import('@/lib/briefings/compliance')
      return NextResponse.json({ ok: true, task, result: await createNonComplianceIncidents() })
    }
    if (task === 'midday') {
      const { runAllMiddayScans } = await import('@/lib/briefings/midday')
      await runAllMiddayScans()
      return NextResponse.json({ ok: true, task, result: 'completed' })
    }
    if (task === 'parse-ai-report') {
      const { runCrossGroupIntelligence } = await import('@/lib/cross-group-intelligence')
      return NextResponse.json({ ok: true, task, result: await runCrossGroupIntelligence() })
    }
    if (task === 'scan') {
      const { scanEnabledGroups } = await import('@/lib/scanner')
      return NextResponse.json({ ok: true, task, result: await scanEnabledGroups() })
    }

    const result = await checkSilenceAndEscalate()
    return NextResponse.json({ ok: true, task, result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
