import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/reasoning/narrative-generator'
import type { ReasoningStepName } from '@/lib/types'

const VALID_STEPS: ReasoningStepName[] = [
  'matching', 'is_incident', 'classification', 'priority', 'routing', 'voice_fit'
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { step?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 })
  }
  const step = body.step as ReasoningStepName | undefined

  if (!step || !VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: 'invalid step' }, { status: 400 })
  }

  try {
    const narrative = await generateNarrative(id, step)
    return NextResponse.json({ narrative })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    console.error('[api:reasoning:narrative]', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
