import type { MatchResult } from '@/lib/matching/incident-matcher'

/**
 * Build the expanded classification prompt that returns all 5 LLM
 * reasoning steps in one JSON response. Matching is NOT included
 * here — it runs deterministically before this and is passed in as
 * context so the model can see what the matcher already decided.
 */
export function buildReasoningClassificationPrompt(
  message: string,
  source: string,
  groupContext: string | undefined,
  matchResult: MatchResult,
  learnedRules: string[] = []
): { system: string; user: string } {

  const ctx = groupContext ? `\nGroup context: ${groupContext}` : ''

  const matchingContext = `\nMATCHING PRE-RESULT (deterministic, already decided):
- Decision: ${matchResult.decision}
- Signal: ${matchResult.signal}
- Confidence: ${matchResult.confidence}
- Reasoning: ${matchResult.reasoning}${matchResult.decision === 'merge' && matchResult.target_id ? `\n- Merge target: ${matchResult.target_id}` : ''}`

  const learnedRulesBlock = learnedRules.length > 0
    ? `\nLEARNED REASONING RULES (from Lee's past corrections):\n${learnedRules.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n`
    : ''

  const system = `You classify BeLive Property Hub messages with FULL REASONING. Co-living operator, 3000+ rooms, 55+ condos, 11 clusters, Malaysia.${ctx}
${matchingContext}
${learnedRulesBlock}
AGENTS: coo (ops/maintenance/tenant), cfo (finance), ceo (owner/people), cto (tech)
SEVERITY: RED (emergency/safety/system down), YELLOW (needs attention), GREEN (routine)
PRIORITY: P1 (act within 2h), P2 (act within 24h), P3 (within 48h)
CATEGORIES: air_con, plumbing, electrical, lift, door_lock, water_heater, general_repair, structural, pest, cleaning, hygiene, move_in, move_out, access_card, onboarding, safety, eviction, payment, complaint, other
PICS: Fatihah (OM), Fariha (Maintenance), Adam (OOE Lead), Linda (Owner Relations), David (Housekeeping)

INCIDENT RULES:
- Any message reporting a problem, complaint, damage, malfunction, urgent request = IS an incident
- Short replies, acknowledgements, thank-yous = NOT an incident
- When in doubt → is_incident: true

TITLE RULES:
- MUST include unit number AND property/cluster AND problem type
- Example: "Water bill abnormally high RM800 — RC A1-21-09"

VOICE FIT RULES:
- "lee" = requires Lee's personal voice (P1 incidents, owner relationships, sensitive people issues)
- "delegate" = routine ops / maintenance / housekeeping that a PIC can handle on Lee's behalf

You MUST return ONLY valid JSON with this exact shape — every step has its own confidence and one-sentence reasoning. DO NOT include the matching step (already done). DO include all 5 remaining steps AND a top-level "situation_summary" field:

{
  "situation_summary": "Leaking incoming pipe at B-15-06 flooding corridor, tenant reports water pooling",
  "is_incident": {
    "decision": true,
    "confidence": 92,
    "reasoning": "Owner-facing complaint requiring response within 24h."
  },
  "classification": {
    "decision": "complaint",
    "confidence": 88,
    "reasoning": "Keywords 'chasing', 'occupancy' indicate owner dissatisfaction with revenue.",
    "detail": {
      "agent": "ceo",
      "problem_type": "owner_relations",
      "severity": "YELLOW",
      "title": "Owner chasing 50% occupancy — C10 B-15-06"
    }
  },
  "priority": {
    "decision": "P2",
    "confidence": 78,
    "reasoning": "Owner-facing venue impact but no immediate threat to exit — P2 not P1."
  },
  "routing": {
    "decision": "Linda",
    "confidence": 91,
    "reasoning": "Owner relations scope belongs to Linda for C10."
  },
  "voice_fit": {
    "decision": "lee",
    "confidence": 85,
    "reasoning": "Owner relationship decision requires Lee's voice — not delegate-safe."
  }
}

Each reasoning MUST be one sentence (max ~20 words). Each confidence MUST be 0-100 integer.

SITUATION SUMMARY rules (for the top-level "situation_summary" string — this renders on the war-room /clusters view):
- One sentence, plain English, HARD LIMIT 140 characters
- Describe WHAT is happening + WHERE (unit/location) + urgency hint
- Do NOT include the owner name (the UI appends it)
- Do NOT include ticket numbers
- Do NOT start with "Incident:" or "Issue:" — get straight to the fact
- Write in the operator's voice, not the tenant's`

  const user = `Source: ${source}\nMessage: ${message}`

  return { system, user }
}
