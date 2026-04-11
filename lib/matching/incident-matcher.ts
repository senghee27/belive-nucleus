import { supabaseAdmin } from '@/lib/supabase-admin'
import { extractKeywords } from '@/lib/incidents'

export type MatchSignal = 'root_id' | 'unit_cluster' | 'ticket_id' | 'none'

export interface MatchResult {
  decision: 'new' | 'merge'
  target_id?: string
  signal: MatchSignal
  confidence: number
  reasoning: string
  decision_detail: Record<string, unknown>
}

const MERGE_WINDOW_HOURS = 72
const OPEN_STATUSES = ['new', 'analysed', 'awaiting_lee', 'acting'] as const

/**
 * Deterministic matcher. No LLM. Runs before classifyMessage.
 *
 * Signal cascade:
 *   1. Lark thread root_id exact match     → decision 'merge', confidence 95
 *   2. Ticket ID (e.g. BLV-RQ-XXXXXX)       → decision 'merge', confidence 92
 *   3. Unit + cluster within 72h + overlap  → decision 'merge', confidence 75-90
 *      (overlap < 40%                       → decision 'new',   confidence 55)
 *   (no match)                              → decision 'new',   confidence 90
 *
 * Conservatism rule: when signals are weak or conflicting, default to 'new'.
 * A false-new is recoverable by manual merge; a false-merge corrupts the
 * incident timeline and the reasoning trace.
 */
export async function findMatchingIncident(input: {
  cluster?: string | null
  raw_content: string
  lark_root_id?: string | null
  sender_open_id?: string | null
}): Promise<MatchResult> {

  // Signal 1: Lark thread root_id exact match
  if (input.lark_root_id) {
    const { data } = await supabaseAdmin
      .from('incidents')
      .select('id')
      .eq('lark_root_id', input.lark_root_id)
      .in('status', OPEN_STATUSES as unknown as string[])
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        decision: 'merge',
        target_id: data.id,
        signal: 'root_id',
        confidence: 95,
        reasoning: `Lark thread root_id exact match with incident ${data.id}.`,
        decision_detail: { root_id: input.lark_root_id, target_id: data.id },
      }
    }
  }

  // Signal 2: ticket ID match (BLV-RQ-XXXXXX, BLV-IN-XXXXXX, etc.)
  const ticketMatch = input.raw_content.match(/\bBLV-[A-Z]{2}-\d{6,}\b/i)
  if (ticketMatch) {
    const ticketId = ticketMatch[0].toLowerCase()
    const { data } = await supabaseAdmin
      .from('incidents')
      .select('id')
      .contains('thread_keywords', [ticketId])
      .in('status', OPEN_STATUSES as unknown as string[])
      .limit(1)
      .maybeSingle()

    if (data) {
      return {
        decision: 'merge',
        target_id: data.id,
        signal: 'ticket_id',
        confidence: 92,
        reasoning: `Ticket ID ${ticketId} matches existing incident ${data.id}.`,
        decision_detail: { ticket_id: ticketId, target_id: data.id },
      }
    }
  }

  // Signal 3: unit + cluster match within window
  const kws = extractKeywords('', input.raw_content)
  const unitKw = kws.find(k => /^[a-z]\d?-\d{1,3}-\d{1,3}[a-z]?$/i.test(k))

  if (unitKw && input.cluster) {
    const cutoff = new Date(Date.now() - MERGE_WINDOW_HOURS * 3600000).toISOString()
    const { data: candidates } = await supabaseAdmin
      .from('incidents')
      .select('id, thread_keywords, created_at')
      .eq('cluster', input.cluster)
      .contains('thread_keywords', [unitKw])
      .in('status', OPEN_STATUSES as unknown as string[])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })

    if (candidates && candidates.length > 0) {
      const best = candidates[0] as { id: string; thread_keywords: string[] | null; created_at: string }
      const overlap = computeKeywordOverlap(kws, best.thread_keywords ?? [])

      if (overlap >= 0.4) {
        const conf = Math.round(75 + overlap * 15) // 75-90 range
        return {
          decision: 'merge',
          target_id: best.id,
          signal: 'unit_cluster',
          confidence: conf,
          reasoning: `Unit ${unitKw} in cluster ${input.cluster} matches existing incident ${best.id} (keyword overlap ${Math.round(overlap * 100)}%).`,
          decision_detail: { unit: unitKw, cluster: input.cluster, keyword_overlap: overlap, target_id: best.id },
        }
      }

      // Weak signal — default to new per conservatism rule
      return {
        decision: 'new',
        signal: 'unit_cluster',
        confidence: 55,
        reasoning: `Unit ${unitKw} appears in existing incident ${best.id} but keyword overlap only ${Math.round(overlap * 100)}% — below 40% threshold. Defaulting to new per conservatism rule.`,
        decision_detail: { unit: unitKw, cluster: input.cluster, keyword_overlap: overlap, candidate_id: best.id, below_threshold: true },
      }
    }
  }

  // No signal matched → new incident, high confidence
  return {
    decision: 'new',
    signal: 'none',
    confidence: 90,
    reasoning: `No Lark thread, ticket ID, or unit+cluster match found in the last ${MERGE_WINDOW_HOURS}h. Creating new incident.`,
    decision_detail: {},
  }
}

export function computeKeywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a.map(k => k.toLowerCase()))
  const setB = new Set(b.map(k => k.toLowerCase()))
  let intersection = 0
  for (const k of setA) if (setB.has(k)) intersection++
  const union = setA.size + setB.size - intersection
  return union > 0 ? intersection / union : 0
}
