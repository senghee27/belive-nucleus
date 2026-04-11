import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type TraceJoinRow = {
  step_name: string
  confidence: number
  incidents: { category: string | null } | null
}

type RevisionJoinRow = {
  outcome: string | null
  version_number: number | null
  incidents: { category: string | null } | null
}

/**
 * Per-step, per-category calibration.
 * For each (step, category) pair:
 *   - stated_confidence  = avg(trace.confidence) over last 30 days, LLM steps only
 *   - actual_approval_rate = (v1 approvals) / (total decided) in same category
 *   - gap = stated - actual   (positive = overconfident)
 */
export async function GET() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { data: tracesRaw } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select(`
      step_name,
      confidence,
      incidents!inner (category)
    `)
    .eq('generated_by', 'llm')
    .gte('created_at', cutoff)

  const { data: revisionsRaw } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      outcome,
      version_number,
      incidents!inner (category)
    `)
    .eq('is_final', true)
    .gte('decided_at', cutoff)

  const traces = (tracesRaw ?? []) as unknown as TraceJoinRow[]
  const revisions = (revisionsRaw ?? []) as unknown as RevisionJoinRow[]

  const traceMap = new Map<string, { sum: number; count: number }>()
  for (const t of traces) {
    const category = t.incidents?.category ?? 'unknown'
    const key = `${t.step_name}|${category}`
    const e = traceMap.get(key) ?? { sum: 0, count: 0 }
    e.sum += t.confidence
    e.count++
    traceMap.set(key, e)
  }

  const catMap = new Map<string, { approved: number; total: number }>()
  for (const r of revisions) {
    const cat = r.incidents?.category ?? 'unknown'
    const e = catMap.get(cat) ?? { approved: 0, total: 0 }
    e.total++
    if (r.outcome === 'approved' && r.version_number === 1) e.approved++
    catMap.set(cat, e)
  }

  const rows: Array<{
    step: string
    category: string
    stated: number
    actual: number
    gap: number
    sample_size: number
  }> = []

  for (const [key, { sum, count }] of traceMap.entries()) {
    const [step, category] = key.split('|')
    const stated = Math.round(sum / count)
    const catRev = catMap.get(category)
    const actual = catRev && catRev.total > 0 ? Math.round((catRev.approved / catRev.total) * 100) : 0
    rows.push({ step, category, stated, actual, gap: stated - actual, sample_size: count })
  }

  rows.sort((a, b) => b.gap - a.gap)

  return NextResponse.json({ calibration: rows })
}
