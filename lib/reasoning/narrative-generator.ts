import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ReasoningStepName } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Generate a conversational narrative for one reasoning step.
 * Called on-demand from the "Deeper explanation" button in StepRow.
 *
 * Cache-hit behavior: if narrative_text is already present on the
 * trace row, it is returned directly without a Claude call. Callers
 * that want a fresh narrative should clear the column first.
 */
export async function generateNarrative(
  incidentId: string,
  stepName: ReasoningStepName
): Promise<string> {
  const { data: trace, error: traceErr } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('step_name', stepName)
    .single()

  if (traceErr || !trace) {
    throw new Error(`Trace not found: ${incidentId} / ${stepName}`)
  }

  // Cache hit — return existing narrative without a Claude call.
  if (trace.narrative_text) return trace.narrative_text as string

  const { data: incident, error: incErr } = await supabaseAdmin
    .from('incidents')
    .select('title, raw_content, cluster, category, priority, severity')
    .eq('id', incidentId)
    .single()

  if (incErr || !incident) {
    throw new Error(`Incident not found: ${incidentId}`)
  }

  const prompt = `You previously classified an incident. Now explain one specific step of your reasoning in a conversational, colleague-to-colleague tone. 3-5 sentences max.

INCIDENT:
- Cluster: ${incident.cluster}
- Title: ${incident.title}
- Raw message: ${incident.raw_content}

YOUR PRIOR DECISION FOR STEP "${stepName}":
- Decision: ${trace.decision}
- Confidence: ${trace.confidence}%
- Short reasoning: ${trace.reasoning_text}
- Input signal: ${JSON.stringify(trace.input_signal ?? {})}

Walk through your thinking: what did you see, what alternatives did you consider, and why did you land on "${trace.decision}" instead? Be honest about the uncertainty — if confidence was low, say why.

Return ONLY the narrative text. No JSON, no headers.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const narrative = msg.content[0]?.type === 'text' ? msg.content[0].text.trim() : ''

  if (narrative) {
    await supabaseAdmin
      .from('incident_reasoning_traces')
      .update({
        narrative_text: narrative,
        narrative_generated_at: new Date().toISOString(),
      })
      .eq('incident_id', incidentId)
      .eq('step_name', stepName)
  }

  return narrative
}
