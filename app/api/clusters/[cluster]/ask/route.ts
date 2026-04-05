import { NextRequest, NextResponse } from 'next/server'
import { generateAskMessage } from '@/lib/cluster-health'

export async function POST(req: NextRequest, { params }: { params: Promise<{ cluster: string }> }) {
  try {
    const { cluster } = await params
    const ticket = await req.json()
    const message = await generateAskMessage(ticket, cluster)
    return NextResponse.json({ ok: true, message })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
