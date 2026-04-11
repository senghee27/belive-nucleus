import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { Incident, ProposalRevision, RevisionFeedback } from '@/lib/types'
import { buildRegenerationPrompt } from './prompt-builder'
import { getCategoryFeedbackForPrompt } from './category-feedback'
import { recomputeCategoryStats } from './category-stats'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function parseAIJson(text: string): { proposal: string; confidence: number; changes_made?: string } | null {
  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  try {
    const parsed = JSON.parse(stripped)
    return {
      proposal: String(parsed.proposal ?? ''),
      confidence: Number(parsed.confidence ?? 0),
      changes_made: parsed.changes_made ? String(parsed.changes_made) : undefined,
    }
  } catch {
    return null
  }
}

/**
 * Create the initial v1 proposal revision when AI generates a proposal.
 */
export async function createInitialRevision(
  incidentId: string,
  proposalText: string,
  confidence: number,
  tokenUsage?: { prompt: number; completion: number },
  pastFeedbackInjected = false
): Promise<ProposalRevision | null> {
  try {
    // Dedup: if v1 already exists for this incident, skip
    const { data: existing } = await supabaseAdmin
      .from('proposal_revisions')
      .select('id')
      .eq('incident_id', incidentId)
      .eq('version_number', 1)
      .maybeSingle()

    if (existing) return null

    const { data, error } = await supabaseAdmin
      .from('proposal_revisions')
      .insert({
        incident_id: incidentId,
        version_number: 1,
        proposal_text: proposalText,
        ai_confidence: confidence,
        outcome: 'pending',
        ai_prompt_tokens: tokenUsage?.prompt ?? null,
        ai_completion_tokens: tokenUsage?.completion ?? null,
        past_feedback_injected: pastFeedbackInjected,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    // Initialize incident tracking columns
    await supabaseAdmin
      .from('incidents')
      .update({ current_version: 1, total_revisions: 0, proposal_outcome: 'pending' })
      .eq('id', incidentId)

    return data as ProposalRevision
  } catch (error) {
    console.error('[learning:createInitialRevision]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

/**
 * Submit feedback on current version. Marks that version as edited.
 */
export async function submitFeedback(
  incidentId: string,
  currentVersion: number,
  feedback: RevisionFeedback
): Promise<void> {
  const { error } = await supabaseAdmin
    .from('proposal_revisions')
    .update({
      feedback_text: feedback.text,
      feedback_tags: feedback.tags,
      outcome: 'edited',
    })
    .eq('incident_id', incidentId)
    .eq('version_number', currentVersion)

  if (error) throw new Error(error.message)

  // Accumulate tags on the incident
  const { data: inc } = await supabaseAdmin
    .from('incidents')
    .select('feedback_tags_accumulated')
    .eq('id', incidentId)
    .single()

  const existingTags = (inc?.feedback_tags_accumulated as string[]) ?? []
  const merged = [...new Set([...existingTags, ...feedback.tags])]

  await supabaseAdmin
    .from('incidents')
    .update({ feedback_tags_accumulated: merged })
    .eq('id', incidentId)
}

/**
 * Generate the next revision using AI, incorporating all feedback from the chain.
 */
export async function regenerateProposal(incidentId: string): Promise<ProposalRevision> {
  // 1. Load chain
  const { data: chain } = await supabaseAdmin
    .from('proposal_revisions')
    .select('*')
    .eq('incident_id', incidentId)
    .order('version_number', { ascending: true })

  if (!chain || chain.length === 0) throw new Error('No revision chain found')

  // 2. Load incident
  const { data: incident } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .single()

  if (!incident) throw new Error('Incident not found')

  // 3. Load past category feedback
  const categoryFeedback = await getCategoryFeedbackForPrompt((incident.category as string) ?? 'other')

  // 4. Build regeneration prompt
  const nextVersion = chain.length + 1
  const prompt = buildRegenerationPrompt(incident as Incident, chain as ProposalRevision[], categoryFeedback)

  // 5. Call Claude
  const msg = await aiClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    messages: [{ role: 'user', content: prompt }],
  })

  const rawText = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const parsed = parseAIJson(rawText)

  const proposalText = parsed?.proposal || rawText.trim() || '[Regeneration failed]'
  const confidence = parsed?.confidence ?? 0

  // 6. Store new revision
  const { data: newRevision, error } = await supabaseAdmin
    .from('proposal_revisions')
    .insert({
      incident_id: incidentId,
      version_number: nextVersion,
      proposal_text: proposalText,
      ai_confidence: confidence,
      outcome: 'pending',
      ai_prompt_tokens: msg.usage?.input_tokens ?? null,
      ai_completion_tokens: msg.usage?.output_tokens ?? null,
      past_feedback_injected: categoryFeedback.length > 0,
    })
    .select()
    .single()

  if (error) throw new Error(error.message)

  // 7. Update incident
  await supabaseAdmin
    .from('incidents')
    .update({
      ai_proposal: proposalText,
      ai_confidence: confidence,
      current_version: nextVersion,
      total_revisions: nextVersion - 1,
    })
    .eq('id', incidentId)

  return newRevision as ProposalRevision
}

/**
 * Append reasoning-step feedback tags to the latest revision of an
 * incident. Separate from `submitFeedback` — that one writes to
 * `feedback_tags` (proposal-level); this one writes to
 * `reasoning_feedback_tags` (which step the AI got wrong).
 */
export async function submitReasoningFeedback(
  incidentId: string,
  tags: string[]
): Promise<void> {
  const { data: active, error: selectErr } = await supabaseAdmin
    .from('proposal_revisions')
    .select('id, reasoning_feedback_tags')
    .eq('incident_id', incidentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (selectErr) throw new Error(selectErr.message)
  if (!active) throw new Error('No revision found for incident')

  const existing = (active.reasoning_feedback_tags as string[] | null) ?? []
  const merged = Array.from(new Set([...existing, ...tags]))

  const { error } = await supabaseAdmin
    .from('proposal_revisions')
    .update({ reasoning_feedback_tags: merged })
    .eq('id', active.id)

  if (error) throw new Error(error.message)
}

/**
 * Finalize the chain on approve/discard/send.
 */
export async function finalizeRevisionChain(
  incidentId: string,
  outcome: 'approved' | 'edited' | 'discarded'
): Promise<void> {
  try {
    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('current_version, category')
      .eq('id', incidentId)
      .single()

    if (!incident) throw new Error('Incident not found')

    const currentVersion = (incident.current_version as number) ?? 1
    const category = (incident.category as string) ?? 'other'
    const now = new Date().toISOString()

    // Mark the current version as final
    await supabaseAdmin
      .from('proposal_revisions')
      .update({
        is_final: true,
        outcome,
        decided_at: now,
      })
      .eq('incident_id', incidentId)
      .eq('version_number', currentVersion)

    // Update incident
    await supabaseAdmin
      .from('incidents')
      .update({
        proposal_outcome: outcome,
        proposal_decided_at: now,
      })
      .eq('id', incidentId)

    // Recompute category stats
    await recomputeCategoryStats(category)
  } catch (error) {
    console.error('[learning:finalizeRevisionChain]', error instanceof Error ? error.message : 'Unknown')
  }
}
