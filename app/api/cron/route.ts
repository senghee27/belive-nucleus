import { NextRequest, NextResponse } from 'next/server'
import { checkSilenceAndEscalate } from '@/lib/incidents'

// Main cron — runs every 15 min
// Handles: silence detection, escalation checks
// Does NOT scan groups (webhook handles that now)
export async function GET(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization')
    if (auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const escalations = await checkSilenceAndEscalate()
    return NextResponse.json({ ok: true, task: 'check-escalations', ...escalations })
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
      const { sendMorningBriefings } = await import('@/lib/briefings/morning')
      return NextResponse.json({ ok: true, task, result: await sendMorningBriefings() })
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
