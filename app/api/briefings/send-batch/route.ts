import { NextRequest, NextResponse } from 'next/server'
import { sendBatchReports } from '@/lib/briefings/report-generator'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { report_ids } = body

    if (!report_ids || !Array.isArray(report_ids) || report_ids.length === 0) {
      return NextResponse.json({ error: 'Missing report_ids array' }, { status: 400 })
    }

    const results = await sendBatchReports(report_ids)
    return NextResponse.json({ ok: true, results })
  } catch (error) {
    console.error('[api:briefings:send-batch]', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
