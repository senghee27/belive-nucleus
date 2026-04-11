import { NextRequest, NextResponse } from 'next/server'
import { submitReasoningFeedback } from '@/lib/learning/revision-manager'
import { REASONING_FEEDBACK_TAGS } from '@/lib/types'

const VALID_TAGS: readonly string[] = REASONING_FEEDBACK_TAGS

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { tags?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const tags = Array.isArray(body.tags) ? (body.tags as string[]) : []

  const invalid = tags.filter(t => !VALID_TAGS.includes(t))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `invalid tags: ${invalid.join(', ')}` }, { status: 400 })
  }
  if (tags.length === 0) {
    return NextResponse.json({ error: 'at least one tag required' }, { status: 400 })
  }

  try {
    await submitReasoningFeedback(id, tags)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    console.error('[api:reasoning:feedback]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
