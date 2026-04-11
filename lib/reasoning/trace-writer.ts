import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ReasoningStepName } from '@/lib/types'

export interface TraceRowInput {
  incident_id: string
  step_name: ReasoningStepName
  step_order: number
  decision: string
  decision_detail?: Record<string, unknown>
  confidence: number
  reasoning_text: string
  model_version?: string | null
  generated_by: 'deterministic' | 'llm'
  input_signal?: Record<string, unknown>
}

function normalize(row: TraceRowInput) {
  return {
    incident_id: row.incident_id,
    step_name: row.step_name,
    step_order: row.step_order,
    decision: row.decision,
    decision_detail: row.decision_detail ?? {},
    confidence: Math.max(0, Math.min(100, Math.round(row.confidence))),
    reasoning_text: row.reasoning_text,
    model_version: row.model_version ?? null,
    generated_by: row.generated_by,
    input_signal: row.input_signal ?? {},
  }
}

/**
 * Write a single trace row. The recompute_min_reasoning_confidence
 * trigger will refresh incidents.min_reasoning_confidence automatically.
 */
export async function writeTrace(row: TraceRowInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .upsert(normalize(row), { onConflict: 'incident_id,step_name' })

  if (error) {
    console.error('[reasoning:writeTrace]', error.message)
    throw error
  }
}

/**
 * Write all 6 trace rows for an incident in one batch. Expected row
 * count is 6 — anything else is logged but not rejected, so callers
 * can still write partial traces during debugging.
 */
export async function writeFullTrace(rows: TraceRowInput[]): Promise<void> {
  if (rows.length === 0) return
  if (rows.length !== 6) {
    console.warn('[reasoning:writeFullTrace] expected 6 rows, got', rows.length)
  }
  const { error } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .upsert(rows.map(normalize), { onConflict: 'incident_id,step_name' })

  if (error) {
    console.error('[reasoning:writeFullTrace]', error.message)
    throw error
  }
}
