import { NextRequest, NextResponse } from 'next/server'
import { checkAndRemindNonCompliant } from '@/lib/briefings/compliance'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const result = await checkAndRemindNonCompliant()
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
