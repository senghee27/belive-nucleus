import { NextRequest, NextResponse } from 'next/server'
import { generateThreadSummary } from '@/lib/issue-thread'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const summary = await generateThreadSummary(id)
    return NextResponse.json({ ok: true, summary, generated_at: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
