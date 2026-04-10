import { NextRequest, NextResponse } from 'next/server'
import { submitFeedback } from '@/lib/learning/revision-manager'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { version, tags, text } = body

    if (!version || typeof version !== 'number') {
      return NextResponse.json({ error: 'version required' }, { status: 400 })
    }
    if ((!tags || tags.length === 0) && !text) {
      return NextResponse.json({ error: 'feedback required (tags or text)' }, { status: 400 })
    }

    await submitFeedback(id, version, { tags: tags ?? [], text: text ?? '' })
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
