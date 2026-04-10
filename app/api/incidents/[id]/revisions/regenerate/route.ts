import { NextRequest, NextResponse } from 'next/server'
import { regenerateProposal } from '@/lib/learning/revision-manager'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const revision = await regenerateProposal(id)

    // Log to watchdog
    try {
      const { logger } = await import('@/lib/activity-logger')
      logger.aiClassified({
        inputContent: revision.proposal_text,
        cluster: 'unknown',
        agent: 'coo',
        category: 'regeneration',
        severity: 'GREEN',
        priority: 'P3',
        confidence: revision.ai_confidence ?? 0,
        isIncident: true,
        processingMs: 0,
      }).catch(() => {})
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true, revision })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
