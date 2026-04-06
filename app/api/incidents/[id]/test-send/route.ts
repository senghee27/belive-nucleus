import { NextRequest, NextResponse } from 'next/server'
import { sendLarkMessage } from '@/lib/lark'

const TEST_CHAT_ID = 'oc_585301f0077f09015428801da0cba90d'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params // validate route param exists
    const body = await req.json()
    const message = body.message as string

    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

    const sent = await sendLarkMessage(TEST_CHAT_ID, message)

    return NextResponse.json({ ok: sent, sent_to: 'Nucleus Testing Group' })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
