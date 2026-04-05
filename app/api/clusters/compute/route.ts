import { NextRequest, NextResponse } from 'next/server'
import { computeAllClusters } from '@/lib/cluster-health'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    await computeAllClusters()
    return NextResponse.json({ ok: true, computed_at: new Date().toISOString() })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
