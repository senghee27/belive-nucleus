import { supabaseAdmin } from '@/lib/supabase-admin'

type ReasoningFeedbackRow = {
  reasoning_feedback_tags: string[] | null
  feedback_text: string | null
  incidents: { category: string | null; assigned_to: string | null } | null
}

/**
 * Extract reasoning-level correction rules for a category.
 *
 * These are injected into the classifyMessage prompt so the AI
 * learns from past reasoning mistakes — e.g. if Lee tagged
 * 'wrong_routing' on five owner_relations incidents where the AI
 * picked Adam instead of Linda, this returns a rule describing
 * that pattern. Rules are only emitted when a tag has appeared
 * on 3+ revisions in the category (noise floor).
 */
export async function getCategoryReasoningRulesForPrompt(
  category: string
): Promise<string[]> {
  const { data: rows } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      reasoning_feedback_tags,
      feedback_text,
      incidents!inner (category, assigned_to)
    `)
    .eq('incidents.category', category)
    .not('reasoning_feedback_tags', 'eq', '{}')
    .order('created_at', { ascending: false })
    .limit(50)

  const list = (rows ?? []) as unknown as ReasoningFeedbackRow[]
  if (list.length === 0) return []

  const tagCounts = new Map<string, { count: number; examples: string[] }>()
  for (const row of list) {
    for (const tag of (row.reasoning_feedback_tags ?? [])) {
      const e = tagCounts.get(tag) ?? { count: 0, examples: [] }
      e.count++
      if (e.examples.length < 2 && row.feedback_text) e.examples.push(row.feedback_text)
      tagCounts.set(tag, e)
    }
  }

  const rules: string[] = []
  for (const [tag, data] of tagCounts.entries()) {
    if (data.count >= 3) {
      const example = data.examples[0] ?? ''
      rules.push(`${tag.replace('wrong_', '')}: ${example}`.slice(0, 200))
    }
  }

  return rules.slice(0, 5)
}
