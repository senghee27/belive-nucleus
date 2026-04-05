import { NextRequest, NextResponse } from 'next/server'
import { leeDecides } from '@/lib/incidents'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { action, instruction } = await req.json()
    if (!['approved', 'edited', 'rejected'].includes(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    const incident = await leeDecides(id, action, instruction)
    return NextResponse.json({ ok: true, incident })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
