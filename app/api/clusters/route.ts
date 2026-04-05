import { NextResponse } from 'next/server'
import { getAllClusterHealth } from '@/lib/cluster-health'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const clusters = await getAllClusterHealth()
    return NextResponse.json({ ok: true, clusters })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
