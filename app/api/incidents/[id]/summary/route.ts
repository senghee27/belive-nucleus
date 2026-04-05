import { NextRequest, NextResponse } from 'next/server'
import { generateSummary } from '@/lib/incidents'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const summary = await generateSummary(id)
    return NextResponse.json({ ok: true, summary })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
