import Anthropic from '@anthropic-ai/sdk'

/**
 * Situation-line generator — the core content quality fix called
 * out in NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md §3.1.
 *
 * The current Livability-Report parser stores the human
 * `issue_description` verbatim, which reads like meta-commentary
 * ("This is an overdue normal priority maintenance request"). The
 * war-room row needs the OPPOSITE: a physical-reality line that
 * answers *"what is broken and why isn't it fixed yet?"* in ≤12
 * words.
 *
 * Format (strict): `{what is broken, where} · {blocker or state}`
 * Fallback (mandatory): when the ticket data has no blocker info,
 *   the SECOND clause MUST literally be "no update". The absence of
 *   data is itself diagnostic — a column showing "no update" 31
 *   times tells the commander the ops system is silent.
 *
 * Forbidden by spec:
 *   - meta-commentary ("This is an overdue …")
 *   - duplicating the pill ("overdue by 6 days")
 *   - the words: priority, SLA, overdue, ticket, request
 *
 * The generator runs during `upsertTickets` for new / changed
 * tickets and during the one-shot backfill script. Summaries are
 * regenerated when upstream data changes so "no update" correctly
 * transitions to a real blocker once one arrives.
 */

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface SituationLineInput {
  issue_description: string
  summary: string | null
  unit_number: string | null
  property: string | null
  owner_name: string | null
  owner_role: string | null
  status: string | null
  age_days: number | null
  // Anything else the Livability Report parser extracted that might
  // signal a blocker (vendor status, contractor notes, escalation
  // trail). The current parser doesn't surface these, so most tickets
  // will hit the "no update" fallback until the parser is expanded.
  extra_notes?: string | null
}

const SYSTEM_PROMPT = `You write war-room situation lines for a property operations commander. Each line appears once in a dense grid and has to tell him what is physically broken and why it's still broken.

RULES (violating any invalidates the output):
1. Format: "{what is physically broken or needs action, where} · {current blocker or state}"
2. Maximum 12 words total, period. Count: every word counts, including "at" and "·".
3. Never use the words: priority, SLA, overdue, ticket, request, maintenance, high, low, critical, urgent.
4. Use concrete nouns. Names of parts, locations, rooms, units. "Washer" not "appliance".
5. The blocker clause is mandatory. If the data has no update about what's blocking progress, write literally "no update" as the second clause. Never omit the "·".
6. Do not restate information already shown elsewhere on the row (age, status, owner).
7. Output ONLY the situation line. No quotes, no preamble, no trailing punctuation.

GOOD (study these):
- Washer broken at B-12-04 · tenant escalated twice
- Tile popped in corridor · contractor quoted, not scheduled
- Aircon compressor failed 21-08 · vendor waiting on KL parts
- Leaking pipe 11-01 · temp patch holding, permanent fix pending
- Dryer drum noise · no update
- Ceiling crack B-08-07 · engineer assessment pending
- Door lock jammed C-15-03 · spare key ordered

BAD (forbidden — these are the current failure mode):
- "This is an overdue normal priority maintenance request" (meta-commentary, tells nothing)
- "Critical priority maintenance ticket overdue by 6 days" (duplicates pill, uses banned words)
- "High priority maintenance request with SLA …" (bureaucratic filler)
- "Washer broken" (missing location AND blocker clause)
- "Aircon not cold at 21-08 — vendor notes pending KL parts." (trailing period, em dash instead of ·)`

/**
 * Produce the fallback literal when the LLM is unavailable or when
 * input data is insufficient to call Claude at all. Always returns
 * "{what, where} · no update" or "{what} · no update".
 */
function buildFallback(input: SituationLineInput): string {
  // Try to squeeze a concrete noun + location out of whatever free
  // text we have so the fallback still reads useful in a list.
  const raw = (input.issue_description || input.summary || '').trim()
  let what = raw.split(/[.·—–-]/)[0]?.trim() || 'Issue'
  // Drop the common meta-commentary prefixes so fallback rows don't
  // read like the thing the spec is literally trying to kill.
  what = what
    .replace(/^(this is |this's )/i, '')
    .replace(/\b(overdue|normal|high|low|critical|urgent|priority|maintenance|cleaning) /gi, '')
    .replace(/\b(ticket|request)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!what) what = 'Issue'
  // Cap at ~8 words so there's room for the location
  const whatWords = what.split(/\s+/).slice(0, 8).join(' ')
  const where = input.unit_number || input.property || ''
  const firstClause = where ? `${whatWords} ${where}`.trim() : whatWords
  return `${firstClause} · no update`
}

export async function generateSituationLine(
  input: SituationLineInput,
): Promise<{ line: string; used_fallback: boolean }> {
  const hasContent = Boolean((input.issue_description || input.summary || '').trim())
  if (!hasContent) {
    return { line: buildFallback(input), used_fallback: true }
  }

  try {
    const userContent = [
      `Issue description: ${input.issue_description || '(none)'}`,
      input.summary ? `Human summary: ${input.summary}` : null,
      input.unit_number ? `Unit: ${input.unit_number}` : null,
      input.property ? `Property: ${input.property}` : null,
      input.owner_name ? `Assigned owner: ${input.owner_name}${input.owner_role ? ` (${input.owner_role})` : ''}` : null,
      input.status ? `Current status: ${input.status}` : null,
      input.age_days !== null ? `Age: ${input.age_days} days` : null,
      input.extra_notes ? `Notes: ${input.extra_notes}` : null,
    ].filter(Boolean).join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userContent }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''
    if (!text) {
      return { line: buildFallback(input), used_fallback: true }
    }

    // Post-process: strip quotes, strip trailing punctuation, clamp
    // to 160 chars (DB constraint), force "· no update" if the LLM
    // dropped the separator or returned only one clause.
    let cleaned = text
      .replace(/^["'`]+|["'`]+$/g, '')
      .replace(/[.!]+$/, '')
      .trim()
    if (!cleaned.includes('·')) {
      cleaned = `${cleaned} · no update`
    }
    if (cleaned.length > 160) cleaned = cleaned.slice(0, 160)

    return { line: cleaned, used_fallback: false }
  } catch (err) {
    console.error('[situation-line]', err instanceof Error ? err.message : 'Unknown')
    return { line: buildFallback(input), used_fallback: true }
  }
}

/**
 * Decide whether an existing ticket row needs a fresh situation
 * line. Called by upsertTickets to decide whether to pay the LLM
 * cost again. Regeneration triggers:
 *   - no previous line at all
 *   - issue_description or summary or status changed
 *   - age_days changed by more than 1 day (vendor status likely shifted)
 *   - previous line is "no update" and we now have more context
 */
export function shouldRegenerate(
  prior: {
    ai_situation_line: string | null
    issue_description: string | null
    summary: string | null
    status: string | null
    age_days: number | null
  } | null,
  next: SituationLineInput,
): boolean {
  if (!prior) return true
  if (!prior.ai_situation_line) return true
  if ((prior.issue_description ?? '') !== (next.issue_description ?? '')) return true
  if ((prior.summary ?? '') !== (next.summary ?? '')) return true
  if ((prior.status ?? '') !== (next.status ?? '')) return true
  if (Math.abs((prior.age_days ?? 0) - (next.age_days ?? 0)) >= 1) return true
  if (/·\s*no update\s*$/i.test(prior.ai_situation_line) && (next.extra_notes ?? '').trim()) return true
  return false
}
