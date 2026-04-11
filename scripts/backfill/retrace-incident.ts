/**
 * retrace-incident.ts — Retroactive reasoning trace backfill
 *
 * Re-runs the new 6-step classifyMessage pipeline against an existing
 * incident that was created before the reasoning-trace feature was
 * deployed (or in any other state where no trace rows exist). Writes
 * the 6 trace rows via writeFullTrace and updates incidents.assigned_to
 * + category if the new classification has structured values.
 *
 * Does NOT regenerate the proposal or touch Lee's lee_action / status
 * — proposeAction is intentionally NOT re-run so any approvals /
 * edits Lee has already made on the existing proposal are preserved.
 *
 * Idempotent: writeFullTrace uses upsert on (incident_id, step_name),
 * so re-running overwrites prior trace rows cleanly.
 *
 * Usage (from belive-nucleus/):
 *   # Against whatever .env.local points to (usually local dev):
 *   npx tsx scripts/backfill/retrace-incident.ts <incident_id>
 *
 *   # Against production (pull creds first, then point at them):
 *   vercel env pull .env.backfill.local
 *   npx tsx scripts/backfill/retrace-incident.ts <incident_id> --env .env.backfill.local
 *
 * Requires: ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, and
 * SUPABASE_SERVICE_KEY in whatever env file you pass in.
 */

// MUST be the first import: _env-preload is side-effect-only and
// populates process.env so downstream imports that read env at module
// load time (lib/incidents.ts → new Anthropic({ apiKey: ... })) see
// the right values. Do not reorder.
import './_env-preload'

import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifyMessage } from '@/lib/incidents'
import { writeFullTrace } from '@/lib/reasoning/trace-writer'
import type { MatchResult } from '@/lib/matching/incident-matcher'

async function main() {
  const incidentId = process.argv[2]
  if (!incidentId) {
    console.error('Usage: npx tsx scripts/backfill/retrace-incident.ts <incident_id>')
    process.exit(1)
  }

  // 1. Load the incident
  const { data: incident, error: loadErr } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .single()

  if (loadErr || !incident) {
    console.error(`❌ Incident not found: ${incidentId}`)
    if (loadErr) console.error('   ', loadErr.message)
    process.exit(1)
  }

  console.log(`\n📋 Incident: ${incident.title}`)
  console.log(`   Cluster: ${incident.cluster ?? '(none)'}  ·  Status: ${incident.status}`)
  console.log(`   Current assigned_to: ${incident.assigned_to ?? '(null)'}`)
  console.log(`   Current category: ${incident.category ?? '(null)'}`)
  console.log(`   Current min_reasoning_confidence: ${incident.min_reasoning_confidence ?? '(null)'}`)

  // 2. Check existing traces (purely informational — upsert handles overwrite)
  const { count: existingTraces } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('id', { count: 'exact', head: true })
    .eq('incident_id', incidentId)

  if ((existingTraces ?? 0) > 0) {
    console.log(`   ⚠  Incident already has ${existingTraces} trace row(s). Upsert will overwrite.`)
  } else {
    console.log(`   ✓  No existing trace rows (as expected for pre-feature incident).`)
  }

  // 3. Build a synthetic 'new' MatchResult to bypass the signal cascade.
  //    Running the real matcher against an incident that's already in the
  //    DB would match itself (via ticket_id in its own thread_keywords,
  //    or via unit+cluster signals), short-circuit as a merge, and skip
  //    the LLM entirely. For backfill we want the 5-step classification
  //    to run fresh, so we tell classifyMessage the incident is new.
  const syntheticMatch: MatchResult = {
    decision: 'new',
    signal: 'none',
    confidence: 100,
    reasoning: 'Synthetic match result for backfill — matcher bypassed.',
    decision_detail: { backfill: true, incident_id: incidentId },
  }

  console.log(`\n🔍 Calling classifyMessage (matcher bypassed, synthetic 'new')…`)
  const result = await classifyMessage(
    incident.raw_content,
    incident.source,
    incident.group_name ?? undefined,
    {
      cluster: incident.cluster,
      lark_root_id: incident.lark_root_id ?? null,
      sender_open_id: incident.sender_open_id ?? null,
    },
    syntheticMatch
  )

  // 4. Sanity: the synthetic match was 'new', so the LLM should have
  //    actually run. If we somehow still got a merge, something upstream
  //    is broken.
  if (result.match_result.decision === 'merge') {
    console.error(`\n❌ Unexpected: classifyMessage returned a merge despite synthetic 'new' input.`)
    console.error(`   Signal: ${result.match_result.signal}, confidence: ${result.match_result.confidence}`)
    console.error(`   Reasoning: ${result.match_result.reasoning}`)
    process.exit(1)
  }

  // 5. Safety check: reasoning_steps must be exactly 6 (full classification).
  //    Empty means LLM fallback fired — we don't want to write nothing
  //    over possible existing data.
  if (result.reasoning_steps.length !== 6) {
    console.error(`\n❌ ABORT: classifyMessage returned ${result.reasoning_steps.length} reasoning steps (expected 6).`)
    console.error(`   Either the LLM call failed or the JSON shape was malformed.`)
    console.error(`   Check Vercel logs for [incidents:classify] errors.`)
    process.exit(1)
  }

  // 6. Write the 6 trace rows (upsert on incident_id, step_name)
  console.log(`\n✍  Writing ${result.reasoning_steps.length} trace rows…`)
  await writeFullTrace(
    result.reasoning_steps.map(step => ({
      ...step,
      incident_id: incidentId,
      model_version: step.generated_by === 'llm' ? 'claude-sonnet-4-6' : null,
    }))
  )

  // 7. Update assigned_to + category on the incident if the new pipeline
  //    produced structured values. Do NOT touch ai_proposal, ai_reasoning,
  //    ai_confidence, lee_action, lee_instruction, or status — preserving
  //    Lee's prior decisions is the whole point.
  const updates: Record<string, unknown> = {}
  if (result.assigned_to && result.assigned_to !== incident.assigned_to) {
    updates.assigned_to = result.assigned_to
  }
  if (result.category && result.category !== 'other' && result.category !== incident.category) {
    updates.category = result.category
  }

  if (Object.keys(updates).length > 0) {
    console.log(`   Updating incident fields:`, updates)
    const { error: updateErr } = await supabaseAdmin
      .from('incidents')
      .update(updates)
      .eq('id', incidentId)
    if (updateErr) {
      console.error(`   ⚠  Update failed: ${updateErr.message}`)
    }
  } else {
    console.log(`   No incident-row updates needed.`)
  }

  // 8. Report
  const minConf = Math.min(...result.reasoning_steps.map(s => s.confidence))
  console.log(`\n✅ BACKFILL COMPLETE`)
  console.log(`   assigned_to:              ${result.assigned_to ?? '(null)'}`)
  console.log(`   category:                 ${result.category}`)
  console.log(`   voice_fit:                ${result.voice_fit}`)
  console.log(`   min_reasoning_confidence: ${minConf}`)
  console.log(`\n   Step summary:`)
  for (const step of result.reasoning_steps) {
    const label = step.step_name.padEnd(16)
    const conf = String(step.confidence).padStart(3)
    console.log(`     ${step.step_order}. ${label} ${conf}%  ${step.decision}`)
  }
  console.log(``)
}

main().catch(err => {
  console.error('\n💥 Backfill failed:', err instanceof Error ? err.message : err)
  if (err instanceof Error && err.stack) console.error(err.stack)
  process.exit(1)
})
