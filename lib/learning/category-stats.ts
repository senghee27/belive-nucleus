import { supabaseAdmin } from '@/lib/supabase-admin'

const ROLLING_WINDOW = 20
const AUTONOMY_THRESHOLD = 0.95

/**
 * Recompute stats for a single category after a decision.
 * Called from finalizeRevisionChain().
 */
export async function recomputeCategoryStats(category: string): Promise<void> {
  try {
    // 1. All final revisions in this category (via inner join on incidents)
    const { data: allRevisions } = await supabaseAdmin
      .from('proposal_revisions')
      .select('outcome, is_final, version_number, decided_at, incidents!inner(category)')
      .eq('incidents.category', category)
      .eq('is_final', true)

    const finals = (allRevisions ?? []) as Array<{ outcome: string; version_number: number; decided_at: string | null }>

    const total = finals.length
    const approvedV1 = finals.filter(r => r.outcome === 'approved' && r.version_number === 1).length
    const approvedEdited = finals.filter(r => r.outcome === 'edited' || (r.outcome === 'approved' && r.version_number > 1)).length
    const discarded = finals.filter(r => r.outcome === 'discarded').length

    const acceptanceRate = total > 0 ? (approvedV1 / total) * 100 : 0
    const editRate = total > 0 ? (approvedEdited / total) * 100 : 0

    // 2. Rolling window of last 20 outcomes
    const last20 = finals
      .slice()
      .sort((a, b) => {
        const at = a.decided_at ? new Date(a.decided_at).getTime() : 0
        const bt = b.decided_at ? new Date(b.decided_at).getTime() : 0
        return bt - at
      })
      .slice(0, ROLLING_WINDOW)
      .map(r => (r.outcome === 'approved' && r.version_number === 1 ? 'approved' : r.outcome))

    // 3. Consecutive v1 approvals
    let consecutiveApprovals = 0
    for (const outcome of last20) {
      if (outcome === 'approved') consecutiveApprovals++
      else break
    }

    // 4. Auto-send eligibility
    const last20ApprovalRate = last20.length >= ROLLING_WINDOW
      ? last20.filter(o => o === 'approved').length / ROLLING_WINDOW
      : 0
    const autoSendEligible = last20ApprovalRate >= AUTONOMY_THRESHOLD

    // 5. Aggregate tag counts across ALL revisions (not just final)
    const { data: allFeedback } = await supabaseAdmin
      .from('proposal_revisions')
      .select('feedback_tags, incidents!inner(category)')
      .eq('incidents.category', category)

    const tagCounts = new Map<string, number>()
    for (const row of (allFeedback ?? []) as Array<{ feedback_tags: string[] | null }>) {
      for (const tag of row.feedback_tags ?? []) {
        tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
      }
    }

    const topTags = [...tagCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))

    // 6. Upsert stats
    await supabaseAdmin
      .from('category_learning_stats')
      .upsert({
        category,
        total_proposals: total,
        approved_v1: approvedV1,
        approved_edited: approvedEdited,
        discarded,
        acceptance_rate: Math.round(acceptanceRate * 100) / 100,
        edit_rate: Math.round(editRate * 100) / 100,
        last_20_outcomes: last20,
        consecutive_approvals: consecutiveApprovals,
        auto_send_eligible: autoSendEligible,
        top_tags: topTags,
      }, { onConflict: 'category' })
  } catch (error) {
    console.error('[learning:recomputeCategoryStats]', error instanceof Error ? error.message : 'Unknown')
  }
}
