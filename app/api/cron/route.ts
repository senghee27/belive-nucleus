import { NextRequest, NextResponse } from 'next/server'
import { scanTestClusters } from '@/lib/lark-groups'
import { sendMorningBriefings } from '@/lib/briefings/morning'

function getTaskFromTime(): string {
  const utcHour = new Date().getUTCHours()
  if (utcHour === 0) return 'morning-briefing'
  if (utcHour === 4) return 'midday-scan'
  if (utcHour === 14) return 'evening-review'
  return 'scan'
}

async function runTask(task: string) {
  switch (task) {
    case 'morning-briefing':
      return { task, result: await sendMorningBriefings() }

    case 'midday-scan':
    case 'evening-review':
    case 'scan':
      return { task, result: await scanTestClusters() }

    default:
      return { task, result: 'Unknown task' }
  }
}

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const task = getTaskFromTime()
    const result = await runTask(task)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[cron:route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const task = (body as Record<string, string>).task ?? getTaskFromTime()
    const result = await runTask(task)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[cron:route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
