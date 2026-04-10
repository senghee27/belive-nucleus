import type { Incident, ProposalRevision, CategoryFeedbackRule } from '@/lib/types'

/**
 * Build the regeneration prompt with full chain + category learned rules.
 */
export function buildRegenerationPrompt(
  incident: Incident,
  chain: ProposalRevision[],
  categoryRules: CategoryFeedbackRule[]
): string {
  const sections: string[] = []

  // Section 1: Category-level learned rules
  if (categoryRules.length > 0) {
    sections.push(`<learned_rules>
Based on past corrections in the "${incident.category}" category, follow these rules:
${categoryRules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n')}
</learned_rules>`)
  }

  // Section 2: Incident context
  sections.push(`<incident>
Category: ${incident.category}
Cluster: ${incident.cluster ?? 'none'}
Severity: ${incident.severity}
Priority: ${incident.priority}
Title: ${incident.title}
Original message:
${incident.raw_content ?? incident.title}
</incident>`)

  // Section 3: Revision chain with feedback
  sections.push(`<revision_chain>`)
  for (const rev of chain) {
    sections.push(`--- Version ${rev.version_number} ---`)
    sections.push(`Proposal: ${rev.proposal_text}`)
    if (rev.feedback_tags && rev.feedback_tags.length > 0) {
      sections.push(`Lee's correction tags: ${rev.feedback_tags.join(', ')}`)
    }
    if (rev.feedback_text) {
      sections.push(`Lee's feedback: ${rev.feedback_text}`)
    }
  }
  sections.push(`</revision_chain>`)

  // Section 4: Instruction
  sections.push(`<instruction>
Generate an improved version (v${chain.length + 1}) of Lee's response for this incident.

You MUST:
1. Address ALL of Lee's feedback from the previous version(s)
2. Follow the learned rules from past corrections in this category
3. Write in Lee's voice: direct Manglish, tag staff by name, give deadlines, end with offer of help
4. Do NOT repeat the same mistake Lee already corrected

Return ONLY valid JSON (no markdown, no backticks):
{
  "proposal": "the full response text",
  "confidence": 0-100,
  "changes_made": "brief note on what changed from previous version"
}
</instruction>`)

  return sections.join('\n\n')
}
