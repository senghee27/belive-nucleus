import { NextRequest, NextResponse } from 'next/server'
import { getSchedulesDueNow, executeSchedule, updateScheduleAfterRun } from '@/lib/scheduler'
import { checkSilenceAndEscalate } from '@/lib/incidents'
import { runCrossGroupIntelligence } from '@/lib/cross-group-intelligence'
import type { ScanSchedule } from '@/lib/scheduler'

export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const due = await getSchedulesDueNow()
    const results: Record<string, unknown> = {}
    for (const s of due) {
      try {
        const r = await executeSchedule(s as ScanSchedule)
        await updateScheduleAfterRun(s.id, 'success', r.summary)
        results[s.name] = r
      } catch (e) {
        await updateScheduleAfterRun(s.id, 'failed', e instanceof Error ? e.message : 'Unknown')
      }
    }
    const esc = await checkSilenceAndEscalate()
    return NextResponse.json({ ok: true, schedules: due.map(s => s.name), results, escalations: esc })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    const task = (body as Record<string, string>).task ?? 'scan'

    if (task === 'check-escalations') {
      return NextResponse.json({ ok: true, result: await checkSilenceAndEscalate() })
    }
    if (task === 'morning-briefing') {
      const { sendMorningBriefings } = await import('@/lib/briefings/morning')
      return NextResponse.json({ ok: true, result: await sendMorningBriefings() })
    }

    const { scanEnabledGroups } = await import('@/lib/scanner')
    return NextResponse.json({ ok: true, result: await scanEnabledGroups() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
