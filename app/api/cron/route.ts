import { NextRequest, NextResponse } from 'next/server'
import { getSchedulesDueNow, executeSchedule, updateScheduleAfterRun } from '@/lib/scheduler'
import { checkAndEscalateOverdueIssues } from '@/lib/issues'
import type { ScanSchedule } from '@/lib/scheduler'

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check for due schedules
    const dueSchedules = await getSchedulesDueNow()
    const results: Record<string, unknown> = {}

    for (const schedule of dueSchedules) {
      try {
        const result = await executeSchedule(schedule as ScanSchedule)
        await updateScheduleAfterRun(schedule.id, 'success', result.summary)
        results[schedule.name] = result
      } catch (error) {
        const msg = error instanceof Error ? error.message : 'Unknown'
        await updateScheduleAfterRun(schedule.id, 'failed', msg)
        results[schedule.name] = { error: msg }
      }
    }

    // Also check escalations
    const escalations = await checkAndEscalateOverdueIssues()

    return NextResponse.json({
      ok: true,
      schedules_run: dueSchedules.map(s => s.name),
      results,
      escalations: { escalated: escalations.escalated },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const task = (body as Record<string, string>).task

    if (task === 'check-escalations') {
      const result = await checkAndEscalateOverdueIssues()
      return NextResponse.json({ ok: true, task, result })
    }

    // Default: run due schedules
    const dueSchedules = await getSchedulesDueNow()
    const results: Record<string, unknown> = {}
    for (const schedule of dueSchedules) {
      const result = await executeSchedule(schedule as ScanSchedule)
      await updateScheduleAfterRun(schedule.id, 'success', result.summary)
      results[schedule.name] = result
    }

    return NextResponse.json({ ok: true, schedules_run: dueSchedules.map(s => s.name), results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
