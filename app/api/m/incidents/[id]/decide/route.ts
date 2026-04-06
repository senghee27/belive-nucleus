import { NextRequest, NextResponse } from 'next/server'
import { leeDecides } from '@/lib/incidents'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { action, edited_message } = body

    if (!action || !['approve', 'skip', 'discard'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    if (action === 'approve') {
      await leeDecides(id, edited_message ? 'edited' : 'approved', edited_message)
    } else if (action === 'discard') {
      await leeDecides(id, 'rejected')
    }
    // skip = no action, just move to next card

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[m:decide]', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
