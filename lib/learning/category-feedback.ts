import { supabaseAdmin } from '@/lib/supabase-admin'
import type { CategoryFeedbackRule } from '@/lib/types'

/**
 * Extract top correction patterns for a category by mining past feedback.
 * Threshold: tag must appear 3+ times to become a rule.
 * Returns top 5 rules sorted by count desc.
 */
export async function getCategoryFeedbackForPrompt(
  category: string
): Promise<CategoryFeedbackRule[]> {
  try {
    const { data: feedbackRows } = await supabaseAdmin
      .from('proposal_revisions')
      .select('feedback_text, feedback_tags, incidents!inner(category)')
      .eq('incidents.category', category)
      .not('feedback_text', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200)

    if (!feedbackRows || feedbackRows.length === 0) return []

    const tagMap = new Map<string, { count: number; examples: string[] }>()

    for (const row of feedbackRows as Array<{ feedback_text: string | null; feedback_tags: string[] | null }>) {
      const tags = row.feedback_tags ?? []
      for (const tag of tags) {
        const existing = tagMap.get(tag) ?? { count: 0, examples: [] }
        existing.count++
        if (existing.examples.length < 3 && row.feedback_text) {
          existing.examples.push(row.feedback_text)
        }
        tagMap.set(tag, existing)
      }
    }

    const sorted = [...tagMap.entries()]
      .filter(([, v]) => v.count >= 3)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 5)

    return sorted.map(([tag, data]) => {
      const example = data.examples[0] ?? ''
      return {
        rule: example ? `${tag}: ${example}` : `Avoid: ${tag.toLowerCase()}`,
        source_count: data.count,
        example_feedback: example,
      }
    })
  } catch (error) {
    console.error('[learning:category-feedback]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}
