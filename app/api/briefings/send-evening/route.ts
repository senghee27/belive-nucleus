import { NextRequest, NextResponse } from 'next/server'
import { sendEveningOCCs } from '@/lib/briefings/evening-occ'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const clusters = (body as Record<string, string[]>).clusters
    const testChatId = (body as Record<string, string>).test_chat_id

    const results = await sendEveningOCCs(clusters, testChatId)
    return NextResponse.json({ ok: true, results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
