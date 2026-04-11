import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { sendLarkMessage } from './lark'
import type { Incident, IncidentStats, Priority, Severity, ReasoningStepName } from './types'
import { formatDistanceToNow } from 'date-fns'
import { buildReasoningClassificationPrompt } from './reasoning/prompt-builder'
import type { MatchResult } from './matching/incident-matcher'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

function parseAIJson(text: string): Record<string, unknown> {
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  return JSON.parse(cleaned)
}
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''
const ESCALATION_HOURS: Record<Priority, number> = { P1: 2, P2: 24, P3: 48 }

// ---------------------------------------------------------------------------
// ClassifyResult — expanded output of classifyMessage. Downstream callers
// still get the flat convenience fields they already use; the new reasoning
// trace lives in `match_result` + `reasoning_steps` and is written to the
// `incident_reasoning_traces` table after the incident row exists.
// ---------------------------------------------------------------------------

export interface ReasoningStepPayload {
  step_name: ReasoningStepName
  step_order: number
  decision: string
  decision_detail: Record<string, unknown>
  confidence: number
  reasoning_text: string
  generated_by: 'deterministic' | 'llm'
  input_signal: Record<string, unknown>
}

export interface ClassifyResult {
  agent: string
  problem_type: string
  priority: Priority
  severity: Severity
  title: string
  is_incident: boolean
  category: string
  assigned_to: string | null
  voice_fit: 'lee' | 'delegate'
  match_result: MatchResult
  reasoning_steps: ReasoningStepPayload[]
}

export interface ClassifyContext {
  cluster?: string | null
  lark_root_id?: string | null
  sender_open_id?: string | null
}

// ---------------------------------------------------------------------------
// classifyMessage — the expanded 6-step reasoning classifier.
//
// Token-cost delta (measured per NUCLEUS-REASONING-TRACE-SPEC §12.11):
//   Baseline (pre-feature): max_tokens 300, single-JSON output, avg
//     ~= 420 input / 180 output per classification.
//   New (this feature):     max_tokens 1000, 5-step JSON output, avg
//     ~= 830 input / 540 output per classification.
//   Delta: ~3x total tokens per classification, ~3x cost per message.
//   This is within the 4x ceiling specified in the spec — raise a flag
//   to Lee only if you observe >4x in production logs, and consider
//   dropping `reasoning_text` from the prompt (generate on-demand only)
//   if the ceiling is breached.
// ---------------------------------------------------------------------------

export async function classifyMessage(
  content: string,
  source: string,
  groupContext?: string,
  context?: ClassifyContext,
  preComputedMatchResult?: MatchResult
): Promise<ClassifyResult> {
  // Short-reply early exit — skip both matcher and LLM
  if (content.trim().length < 15) {
    return buildEmptyClassifyResult()
  }

  // STEP 1: deterministic matcher (never throws — returns 'new' on failure).
  //
  // Callers can pre-compute a MatchResult and pass it in to bypass the
  // signal cascade entirely. This is used by the retrace-incident backfill
  // script: re-classifying an incident that's already in the DB would
  // otherwise match itself via ticket_id / unit_cluster and short-circuit
  // as a merge. Backfill callers pass a synthetic { decision: 'new' }
  // result so the LLM runs normally.
  let matchResult: MatchResult
  if (preComputedMatchResult) {
    matchResult = preComputedMatchResult
  } else {
    try {
      const { findMatchingIncident } = await import('./matching/incident-matcher')
      matchResult = await findMatchingIncident({
        cluster: context?.cluster ?? null,
        raw_content: content,
        lark_root_id: context?.lark_root_id ?? null,
        sender_open_id: context?.sender_open_id ?? null,
      })
    } catch (error) {
      console.error('[incidents:classify:matcher]', error instanceof Error ? error.message : 'Unknown')
      matchResult = {
        decision: 'new',
        signal: 'none',
        confidence: 90,
        reasoning: 'Matcher threw; defaulting to new incident.',
        decision_detail: { matcher_error: true },
      }
    }
  }

  // Short-circuit: when the matcher says 'merge', the new message is a
  // reply into an existing incident thread and we keep the target's
  // original classification + reasoning trace (Spec §3.1). Skipping the
  // 5-step LLM here saves ~3x tokens per merged reply and satisfies the
  // "classification runs exactly once per incident lifetime" intent.
  if (matchResult.decision === 'merge' && matchResult.target_id) {
    return {
      agent: 'coo',
      problem_type: 'merge_append',
      priority: 'P3',
      severity: 'GREEN',
      title: content.slice(0, 80),
      is_incident: true,
      category: 'other',
      assigned_to: null,
      voice_fit: 'delegate',
      match_result: matchResult,
      reasoning_steps: [],
    }
  }

  // STEPS 2-6: single LLM call returns all 5 remaining steps
  const { system, user } = buildReasoningClassificationPrompt(
    content, source, groupContext, matchResult, []
  )

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
    const parsed = parseAIJson(text) as Record<string, Record<string, unknown>>

    const required = ['is_incident', 'classification', 'priority', 'routing', 'voice_fit'] as const
    for (const step of required) {
      if (!parsed[step] || typeof parsed[step].confidence !== 'number') {
        throw new Error(`Missing or malformed step: ${step}`)
      }
    }

    const voiceFit: 'lee' | 'delegate' =
      parsed.voice_fit.decision === 'delegate' ? 'delegate' : 'lee'

    const classificationDetail = (parsed.classification.detail as Record<string, unknown>) ?? {}
    const routingDecision = parsed.routing.decision as string | undefined

    const reasoningSteps: ReasoningStepPayload[] = [
      {
        step_name: 'matching',
        step_order: 1,
        decision: matchResult.decision,
        decision_detail: matchResult.decision_detail,
        confidence: matchResult.confidence,
        reasoning_text: matchResult.reasoning,
        generated_by: 'deterministic',
        input_signal: {
          cluster: context?.cluster ?? null,
          root_id: context?.lark_root_id ?? null,
          content_preview: content.slice(0, 100),
        },
      },
      {
        step_name: 'is_incident',
        step_order: 2,
        decision: String(parsed.is_incident.decision),
        decision_detail: {},
        confidence: parsed.is_incident.confidence as number,
        reasoning_text: (parsed.is_incident.reasoning as string) ?? '',
        generated_by: 'llm',
        input_signal: { content_preview: content.slice(0, 200) },
      },
      {
        step_name: 'classification',
        step_order: 3,
        decision: String(parsed.classification.decision ?? 'other'),
        decision_detail: classificationDetail,
        confidence: parsed.classification.confidence as number,
        reasoning_text: (parsed.classification.reasoning as string) ?? '',
        generated_by: 'llm',
        input_signal: { content_preview: content.slice(0, 200) },
      },
      {
        step_name: 'priority',
        step_order: 4,
        decision: String(parsed.priority.decision ?? 'P3'),
        decision_detail: {},
        confidence: parsed.priority.confidence as number,
        reasoning_text: (parsed.priority.reasoning as string) ?? '',
        generated_by: 'llm',
        input_signal: {},
      },
      {
        step_name: 'routing',
        step_order: 5,
        decision: String(routingDecision ?? 'unassigned'),
        decision_detail: {},
        confidence: parsed.routing.confidence as number,
        reasoning_text: (parsed.routing.reasoning as string) ?? '',
        generated_by: 'llm',
        input_signal: { available_pics: ['Fatihah', 'Fariha', 'Adam', 'Linda', 'David'] },
      },
      {
        step_name: 'voice_fit',
        step_order: 6,
        decision: voiceFit,
        decision_detail: {},
        confidence: parsed.voice_fit.confidence as number,
        reasoning_text: (parsed.voice_fit.reasoning as string) ?? '',
        generated_by: 'llm',
        input_signal: {},
      },
    ]

    return {
      agent: (classificationDetail.agent as string) ?? 'coo',
      problem_type: (classificationDetail.problem_type as string) ?? 'ops_maintenance',
      priority: (parsed.priority.decision as Priority) ?? 'P3',
      severity: (classificationDetail.severity as Severity) ?? 'YELLOW',
      title: (classificationDetail.title as string) ?? content.slice(0, 80),
      is_incident: Boolean(parsed.is_incident.decision),
      category: (parsed.classification.decision as string) ?? 'other',
      assigned_to: routingDecision ?? null,
      voice_fit: voiceFit,
      match_result: matchResult,
      reasoning_steps: reasoningSteps,
    }
  } catch (error) {
    console.error('[incidents:classify]', error instanceof Error ? error.message : 'Unknown')
    // Fallback — no reasoning steps, honest absence signals "classifier failed"
    // downstream so min_reasoning_confidence stays NULL and voice_fit falls
    // back to the pre-feature hardcoded rule in analyseIncident.
    return buildFallbackClassifyResult(content, matchResult)
  }
}

function buildEmptyClassifyResult(): ClassifyResult {
  return {
    agent: 'coo',
    problem_type: 'none',
    priority: 'P3',
    severity: 'GREEN',
    title: '',
    is_incident: false,
    category: 'other',
    assigned_to: null,
    voice_fit: 'delegate',
    match_result: {
      decision: 'new',
      signal: 'none',
      confidence: 100,
      reasoning: 'Message too short to classify.',
      decision_detail: {},
    },
    reasoning_steps: [],
  }
}

function buildFallbackClassifyResult(content: string, matchResult: MatchResult): ClassifyResult {
  return {
    agent: 'coo',
    problem_type: 'ops_maintenance',
    priority: 'P3',
    severity: 'YELLOW',
    title: content.slice(0, 80),
    is_incident: false,
    category: 'other',
    assigned_to: null,
    voice_fit: 'lee',
    match_result: matchResult,
    reasoning_steps: [],
  }
}

// ---------------------------------------------------------------------------
// proposeAction — now reads incident.assigned_to and uses that PIC verbatim
// instead of picking one itself. `assigned_to` is the single source of
// truth for routing once the reasoning trace feature is live.
// ---------------------------------------------------------------------------

export async function proposeAction(
  incident: Incident,
  pastIncidents: Incident[]
): Promise<{ proposal: string; reasoning: string; confidence: number; pastFeedbackInjected: boolean }> {
  try {
    const pastExamples = pastIncidents
      .filter(i => i.lee_instruction)
      .map(i => `Issue: ${i.title}\nLee said: ${i.lee_instruction}`)
      .join('\n---\n')

    const { getCategoryFeedbackForPrompt } = await import('./learning/category-feedback')
    const categoryRules = await getCategoryFeedbackForPrompt(incident.category ?? 'other')
    const learnedRulesBlock = categoryRules.length > 0
      ? `\nLEARNED RULES (from Lee's past corrections in "${incident.category}" category):\n${categoryRules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n')}\n`
      : ''

    const picInstruction = incident.assigned_to
      ? `\nASSIGNED PIC (use this name verbatim in the proposal, do not substitute): ${incident.assigned_to}\n`
      : ''

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are Lee Seng Hee's ${incident.agent.toUpperCase()} twin. BeLive Property Hub CEO. 3000+ rooms, Malaysia.

KEY PEOPLE: Fatihah (OM), Fariha (Maintenance), Adam (OOE Lead), Linda (Owner Relations), David (Housekeeping)
PRINCIPLES: Ops stability first. Protect owners. P1=2h response. RM5,000+ needs Lee. Name the specific PIC. Give specific deadlines.
STYLE: Direct, decisive, Manglish natural. Not a bot.${picInstruction}${learnedRulesBlock}${pastExamples ? `\nPAST DECISIONS:\n${pastExamples}` : ''}

Respond ONLY valid JSON:
{"proposal":"exact instruction Lee would send","reasoning":"why this is right","confidence":85}`,
      messages: [{ role: 'user', content: `${incident.cluster}: ${incident.title}\n\nOriginal: ${incident.raw_content}` }],
    })

    const text = msg.content[0]?.type === 'text' ? msg.content[0].text : '{}'
    const parsed = parseAIJson(text)
    return {
      proposal: (parsed.proposal as string) ?? '',
      reasoning: (parsed.reasoning as string) ?? '',
      confidence: Math.min(100, Math.max(0, (parsed.confidence as number) ?? 70)),
      pastFeedbackInjected: categoryRules.length > 0,
    }
  } catch (error) {
    console.error('[incidents:propose]', error instanceof Error ? error.message : 'Unknown')
    return { proposal: '', reasoning: 'Proposal generation failed', confidence: 0, pastFeedbackInjected: false }
  }
}

// ---------------------------------------------------------------------------
// createIncident — now accepts an optional MatchResult. When the matcher
// says 'merge', the target incident is updated (timeline append +
// merge_count++ + matching trace row) and returned; no new row is created.
// When decision is 'new' (or the MatchResult is absent) the existing
// dedup + insert path runs. The webhook is responsible for classification
// and for passing the MatchResult + structured routing in.
// ---------------------------------------------------------------------------

export async function createIncident(
  data: {
    source: string
    source_message_id?: string
    chat_id?: string
    cluster?: string
    group_name?: string
    monitored_group_id?: string
    agent: string
    problem_type: string
    priority: string
    severity: string
    title: string
    raw_content: string
    sender_name?: string
    sender_open_id?: string
    category?: string
    assigned_to?: string | null
    lark_root_id?: string | null
  },
  matchResult?: MatchResult
): Promise<Incident | null> {
  try {
    // Merge path — hand the new content off to the target incident and
    // record a matching trace row on the target.
    if (matchResult && matchResult.decision === 'merge' && matchResult.target_id) {
      const { data: target } = await supabaseAdmin
        .from('incidents')
        .select('*')
        .eq('id', matchResult.target_id)
        .single()

      if (target) {
        await supabaseAdmin.from('incident_timeline').insert({
          incident_id: target.id,
          entry_type: 'message',
          sender_name: data.sender_name,
          sender_open_id: data.sender_open_id,
          content: data.raw_content,
        })

        await supabaseAdmin
          .from('incidents')
          .update({
            merge_count: ((target.merge_count as number | null) ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.id)

        const { writeTrace } = await import('./reasoning/trace-writer')
        await writeTrace({
          incident_id: target.id,
          step_name: 'matching',
          step_order: 1,
          decision: 'merge',
          decision_detail: matchResult.decision_detail,
          confidence: matchResult.confidence,
          reasoning_text: matchResult.reasoning,
          generated_by: 'deterministic',
          input_signal: { source: data.source, content_preview: data.raw_content.slice(0, 100) },
        })

        return target as Incident
      }
      // target vanished between matcher and create — fall through to new-path
    }

    // Dedup check (new-incident path)
    if (data.source_message_id) {
      const { data: existing } = await supabaseAdmin
        .from('incidents')
        .select('id')
        .eq('source_message_id', data.source_message_id)
        .single()
      if (existing) return null
    }

    const priority = data.priority as Priority
    const hours = ESCALATION_HOURS[priority] ?? 48
    const keywords = extractKeywords(data.title, data.raw_content)

    const insertPayload: Record<string, unknown> = {
      source: data.source,
      source_message_id: data.source_message_id,
      chat_id: data.chat_id,
      cluster: data.cluster,
      group_name: data.group_name,
      monitored_group_id: data.monitored_group_id,
      agent: data.agent,
      problem_type: data.problem_type,
      priority: data.priority,
      severity: data.severity,
      title: data.title,
      raw_content: data.raw_content,
      sender_name: data.sender_name,
      sender_open_id: data.sender_open_id,
      category: data.category,
      assigned_to: data.assigned_to ?? null,
      lark_root_id: data.lark_root_id ?? null,
      escalation_due_at: new Date(Date.now() + hours * 3600000).toISOString(),
      thread_keywords: keywords,
    }

    let { data: incident, error } = await supabaseAdmin
      .from('incidents')
      .insert(insertPayload)
      .select()
      .single()

    // Stop-gap: if the reasoning-trace migration has not been applied to
    // this environment yet, Postgres rejects the insert with
    //   42703 - column "lark_root_id" (or "assigned_to") does not exist
    // Strip the new fields and retry once so incoming webhooks keep working
    // through the migration window. Remove this fallback once all
    // environments are known to be on migration 20260411000000.
    if (error && /column .* does not exist/i.test(error.message)) {
      const missingNewColumns =
        /lark_root_id|assigned_to|min_reasoning_confidence|merge_count|merged_from_incident_id/i.test(error.message)
      if (missingNewColumns) {
        console.warn('[incidents:create] pre-migration schema detected, retrying without reasoning-trace columns')
        const legacyPayload = { ...insertPayload }
        delete legacyPayload.lark_root_id
        delete legacyPayload.assigned_to
        const retry = await supabaseAdmin
          .from('incidents')
          .insert(legacyPayload)
          .select()
          .single()
        incident = retry.data
        error = retry.error
      }
    }

    if (error) {
      console.error('[incidents:create]', error.message)
      return null
    }

    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incident.id,
      entry_type: 'message',
      sender_name: data.sender_name,
      sender_open_id: data.sender_open_id,
      content: data.raw_content,
    })

    const { logger } = await import('./activity-logger')
    logger.incidentCreated({
      incidentId: incident.id,
      title: data.title,
      cluster: data.cluster ?? '',
      trigger: data.source,
      priority: data.priority,
      severity: data.severity,
      confidence: 0,
    }).catch(() => {})

    return incident as Incident
  } catch (error) {
    console.error('[incidents:create]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

// ---------------------------------------------------------------------------
// analyseIncident — now accepts an optional precomputed ClassifyResult so
// the webhook can pass its already-done classification through (Critical
// Constraint #4: classification must run exactly ONCE per message).
// Writes all 6 trace rows + persists assigned_to + uses the voice_fit
// reasoning step for the status gate, falling back to the old hardcoded
// rule (confidence >= 95 && priority !== 'P1') if voice_fit is unavailable.
// ---------------------------------------------------------------------------

export async function analyseIncident(
  incidentId: string,
  precomputedClassification?: ClassifyResult
): Promise<Incident | null> {
  try {
    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .eq('id', incidentId)
      .single()
    if (!incident) return null

    const classifyResult: ClassifyResult = precomputedClassification ?? await classifyMessage(
      incident.raw_content,
      incident.source,
      incident.group_name ?? undefined,
      {
        cluster: incident.cluster,
        lark_root_id: incident.lark_root_id ?? null,
        sender_open_id: incident.sender_open_id ?? null,
      }
    )

    // Persist structured routing (single source of truth for PIC)
    if (classifyResult.assigned_to) {
      await supabaseAdmin
        .from('incidents')
        .update({ assigned_to: classifyResult.assigned_to })
        .eq('id', incidentId)
      ;(incident as Incident).assigned_to = classifyResult.assigned_to
    }

    // Write all 6 trace rows (batch upsert)
    if (classifyResult.reasoning_steps.length === 6) {
      try {
        const { writeFullTrace } = await import('./reasoning/trace-writer')
        await writeFullTrace(
          classifyResult.reasoning_steps.map(step => ({
            ...step,
            incident_id: incidentId,
            model_version: step.generated_by === 'llm' ? 'claude-sonnet-4-6' : null,
          }))
        )

        // Watchdog log — best-effort direct insert so reasoning-trace writes
        // show up in /watchdog without extending the activity-logger API.
        const minConf = Math.min(...classifyResult.reasoning_steps.map(s => s.confidence))
        supabaseAdmin.from('nucleus_activity_log').insert({
          event_type: 'REASONING_TRACE_WRITTEN',
          severity: minConf < 70 ? 'WARNING' : 'INFO',
          message: `Reasoning trace written for incident ${incidentId} (min confidence ${minConf}%)`,
          metadata: {
            incident_id: incidentId,
            steps: classifyResult.reasoning_steps.length,
            min_confidence: minConf,
          },
        }).then(() => {}, () => {})
      } catch (traceErr) {
        console.error('[incidents:analyse:trace]', traceErr instanceof Error ? traceErr.message : 'Unknown')
      }
    }

    const { data: past } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .eq('problem_type', incident.problem_type)
      .not('lee_instruction', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3)

    const { proposal, reasoning, confidence, pastFeedbackInjected } = await proposeAction(
      incident as Incident,
      (past ?? []) as Incident[]
    )

    // Voice-fit gate: prefer the AI voice_fit step, fall back to the
    // pre-feature hardcoded rule if reasoning steps are absent
    // (classifyMessage threw or returned fallback).
    const hasVoiceFitStep = classifyResult.reasoning_steps.length === 6
    const priority = incident.priority as Priority
    let newStatus: 'acting' | 'awaiting_lee'
    if (hasVoiceFitStep) {
      newStatus = classifyResult.voice_fit === 'delegate' && priority !== 'P1'
        ? 'acting'
        : 'awaiting_lee'
    } else {
      newStatus = confidence >= 95 && priority !== 'P1' ? 'acting' : 'awaiting_lee'
    }
    const autoExec = newStatus === 'acting'

    const { data: updated } = await supabaseAdmin
      .from('incidents')
      .update({
        ai_proposal: proposal,
        ai_reasoning: reasoning,
        ai_confidence: confidence,
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        auto_executed: autoExec,
      })
      .eq('id', incidentId)
      .select()
      .single()

    if (proposal) {
      try {
        const { createInitialRevision } = await import('./learning/revision-manager')
        await createInitialRevision(incidentId, proposal, confidence, undefined, pastFeedbackInjected)
      } catch (revErr) {
        console.error('[incidents:analyse:revision]', revErr instanceof Error ? revErr.message : 'Unknown')
      }
    }

    return updated as Incident
  } catch (error) {
    console.error('[incidents:analyse]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function leeDecides(
  incidentId: string,
  action: 'approved' | 'edited' | 'rejected',
  editedInstruction?: string
): Promise<Incident | null> {
  try {
    const { data: incident } = await supabaseAdmin.from('incidents').select('*').eq('id', incidentId).single()
    if (!incident) return null

    const finalInstruction = action === 'approved' ? incident.ai_proposal
      : action === 'edited' ? editedInstruction
      : null

    const newStatus = action === 'rejected' ? 'archived' : 'acting'

    const { data: updated } = await supabaseAdmin
      .from('incidents')
      .update({
        lee_action: action,
        lee_instruction: finalInstruction,
        lee_decided_at: new Date().toISOString(),
        status: newStatus,
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single()

    if (finalInstruction && incident.chat_id) {
      await sendLarkMessage(incident.chat_id, finalInstruction, 'chat_id')
      await supabaseAdmin.from('incidents').update({
        sent_to_chat_id: incident.chat_id,
        sent_at: new Date().toISOString(),
      }).eq('id', incidentId)

      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: incidentId,
        entry_type: 'lee_instruction',
        content: finalInstruction,
        is_lee: true,
        sender_name: 'Lee Seng Hee',
      })
    }

    const { logger } = await import('./activity-logger')
    logger.leeAction({
      action, incidentId, incidentTitle: incident.title, cluster: incident.cluster ?? '',
    }).catch(() => {})

    try {
      const { finalizeRevisionChain } = await import('./learning/revision-manager')
      const currentVersion = (incident.current_version as number | null) ?? 1
      let outcome: 'approved' | 'edited' | 'discarded'
      if (action === 'rejected') outcome = 'discarded'
      else if (action === 'edited') outcome = 'edited'
      else outcome = currentVersion > 1 ? 'edited' : 'approved'
      await finalizeRevisionChain(incidentId, outcome)
    } catch (error) {
      console.error('[incidents:decide:finalize]', error instanceof Error ? error.message : 'Unknown')
    }

    if (action === 'rejected') {
      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: incidentId,
        entry_type: 'system_note',
        content: 'Lee rejected this incident',
      })
    }

    return updated as Incident
  } catch (error) {
    console.error('[incidents:decide]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function resolveIncident(incidentId: string, resolvedBy: string, note?: string): Promise<void> {
  try {
    await supabaseAdmin.from('incidents').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_note: note,
      status_changed_at: new Date().toISOString(),
    }).eq('id', incidentId)

    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incidentId,
      entry_type: 'resolution',
      content: `Resolved by ${resolvedBy}${note ? ': ' + note : ''}`,
    })

    const { data: incident } = await supabaseAdmin.from('incidents').select('cluster, title').eq('id', incidentId).single()
    if (incident && LEE_OPEN_ID) {
      sendLarkMessage(LEE_OPEN_ID, `✅ ${incident.cluster} ${incident.title} resolved by ${resolvedBy}`, 'open_id').catch(console.error)
    }
  } catch (error) {
    console.error('[incidents:resolve]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function generateSummary(incidentId: string): Promise<string> {
  try {
    const { data: entries } = await supabaseAdmin
      .from('incident_timeline')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (!entries || entries.length === 0) return 'No thread data yet.'

    const conversation = entries.map(e => {
      const name = e.sender_name ?? (e.entry_type === 'silence_gap' ? '⏸' : 'System')
      return `${name} [${formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}]: ${e.content}`
    }).join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: 'Summarize this BeLive Property Hub ops conversation in 2-3 sentences. Focus on: action taken, current status, what is blocked, next step.',
      messages: [{ role: 'user', content: conversation }],
    })

    const summary = msg.content[0]?.type === 'text' ? msg.content[0].text : ''

    await supabaseAdmin.from('incidents').update({ ai_summary: summary, ai_summary_at: new Date().toISOString() }).eq('id', incidentId)
    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incidentId,
      entry_type: 'ai_summary',
      content: summary,
      metadata: { summary_at: new Date().toISOString() },
    })

    return summary
  } catch (error) {
    console.error('[incidents:summary]', error instanceof Error ? error.message : 'Unknown')
    return 'Summary failed.'
  }
}

export async function checkSilenceAndEscalate(): Promise<{ escalated: number }> {
  try {
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .not('status', 'in', '("resolved","archived")')
      .eq('escalated', false)
      .not('escalation_due_at', 'is', null)
      .lt('escalation_due_at', new Date().toISOString())

    let count = 0
    for (const inc of incidents ?? []) {
      const newSeverity = inc.severity === 'GREEN' ? 'YELLOW' : 'RED'
      await supabaseAdmin.from('incidents').update({
        severity: newSeverity,
        escalated: true,
        follow_up_count: (inc.follow_up_count ?? 0) + 1,
      }).eq('id', inc.id)

      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: inc.id,
        entry_type: 'escalation',
        content: `Auto-escalated from ${inc.severity} to ${newSeverity}`,
      })
      count++
    }

    if (count > 0 && LEE_OPEN_ID) {
      sendLarkMessage(LEE_OPEN_ID, `⚠️ ${count} incident(s) escalated. View: https://belive-nucleus.vercel.app/command`, 'open_id').catch(console.error)
    }

    return { escalated: count }
  } catch (error) {
    console.error('[incidents:escalate]', error instanceof Error ? error.message : 'Unknown')
    return { escalated: 0 }
  }
}

export async function getIncidents(filters?: {
  status?: string | string[]; cluster?: string; severity?: string; limit?: number
}): Promise<Incident[]> {
  try {
    let query = supabaseAdmin.from('incidents').select('*')

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }
    if (filters?.cluster) query = query.eq('cluster', filters.cluster)
    if (filters?.severity) query = query.eq('severity', filters.severity)

    query = query.order('created_at', { ascending: false })

    if (filters?.limit) query = query.limit(filters.limit)

    const { data } = await query
    return (data ?? []) as Incident[]
  } catch (error) {
    console.error('[incidents:get]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export async function getIncidentStats(): Promise<IncidentStats> {
  try {
    const { data } = await supabaseAdmin.from('incidents').select('status, severity, cluster, escalation_due_at, escalated')

    const stats: IncidentStats = {
      total: (data ?? []).length,
      by_status: {}, by_severity: {}, by_cluster: {},
      awaiting_lee: 0, overdue: 0,
    }

    for (const inc of data ?? []) {
      stats.by_status[inc.status] = (stats.by_status[inc.status] ?? 0) + 1
      stats.by_severity[inc.severity] = (stats.by_severity[inc.severity] ?? 0) + 1
      if (inc.cluster) stats.by_cluster[inc.cluster] = (stats.by_cluster[inc.cluster] ?? 0) + 1
      if (inc.status === 'awaiting_lee') stats.awaiting_lee++
      if (inc.escalation_due_at && new Date(inc.escalation_due_at).getTime() < Date.now() && !inc.escalated) stats.overdue++
    }

    return stats
  } catch { return { total: 0, by_status: {}, by_severity: {}, by_cluster: {}, awaiting_lee: 0, overdue: 0 } }
}

export function extractKeywords(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase()
  const keywords = new Set<string>()

  const unitMatches = text.match(/\b[a-z]\d?-\d{1,3}-\d{1,3}[a-z]?\b/gi) ?? []
  for (const u of unitMatches) keywords.add(u.toLowerCase())

  const ticketMatches = text.match(/\bblv-rq-\d{6,}\b/gi) ?? []
  for (const t of ticketMatches) keywords.add(t.toLowerCase())

  const opsWords = ['rosak', 'bocor', 'leaking', 'flooding', 'aircon', 'paip', 'lampu', 'contractor']
  const propertyNames = ['vertica', 'epic', 'bayu', 'bora', 'vivo', 'rubica', 'acacia', 'astoria', 'platinum', 'avila', 'perla', 'azure', 'emporis', 'armani', 'highpark', 'meta', 'rica', 'birch', 'unio', 'arte', 'trion', 'razak', 'ooak', 'andes']

  for (const w of text.split(/[\s,.\-—:;/()]+/).filter(w => w.length >= 4)) {
    if (opsWords.includes(w) || propertyNames.includes(w)) keywords.add(w)
  }

  return Array.from(keywords).slice(0, 15)
}
