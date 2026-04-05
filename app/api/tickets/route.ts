import { NextRequest, NextResponse } from 'next/server'
import { getOpenTickets } from '@/lib/ai-report-parser'

export async function GET(req: NextRequest) {
  try {
    const cluster = req.nextUrl.searchParams.get('cluster') ?? undefined
    const slaOverdue = req.nextUrl.searchParams.get('sla_overdue')
    const tickets = await getOpenTickets({
      cluster,
      sla_overdue: slaOverdue === 'true' ? true : undefined,
    })
    return NextResponse.json({ ok: true, tickets })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
