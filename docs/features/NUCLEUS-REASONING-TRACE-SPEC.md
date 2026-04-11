# BeLive Nucleus — Reasoning Trace + Backend Upgrade Spec

**Feature:** Per-step reasoning trace, real incident matcher, structured owner routing, AI voice-fit step, `/reasoning` analytics, Learning Engine calibration
**Version:** 1.0
**Date:** 11 April 2026
**Author:** Lee Seng Hee
**Status:** Ready to build

---

## 1. Philosophy

Nucleus today gives Lee one bit of information per classification: a final label (`category`, `priority`, `assigned_to` embedded in proposal text) with no trail of *why*. When the system is right, it looks smart. When it's wrong — like the recent bug where a maintenance list was pulled into an unrelated occupancy incident — Lee has to become a detective. He opens logs, diffs payloads, re-reads the raw message, and guesses which heuristic fired. A 30-second bug becomes a 30-minute investigation.

This is the same problem doctors solved 150 years ago with SOAP notes. Subjective, Objective, Assessment, Plan. A doctor doesn't just write "prescribe antibiotics" — they document what they saw, what they tested, what they concluded, and why. That's what makes the decision auditable, teachable, and correctable. Nucleus needs the same discipline.

This feature does two things Lee has to sign off on together, because neither works without the other:

**(1) Build the backend decisions worth observing.** Right now the "matching" step doesn't exist (dedup only on exact `source_message_id`), "routing" lives inside freeform proposal text with no structured field, and "voice_fit" is a one-line hardcoded rule. You can't instrument reasoning that the code doesn't make. So this spec adds a real matcher (thread `root_id` → unit identifier → ticket ID cascade), a structured `incidents.assigned_to` column populated by an AI routing step, and a real `voice_fit` AI step that replaces the `confidence >= 95 && priority !== 'P1'` formula.

**(2) Instrument every decision with per-step reasoning + confidence.** Each of the 6 steps (matching, is_incident, classification, priority, routing, voice_fit) writes a row to a new `incident_reasoning_traces` table capturing its decision, confidence, a one-sentence reasoning, and the input signal. A derived `incidents.min_reasoning_confidence` column surfaces the weakest link. When any step is below 70%, the incident gets a red dot in the Command Center queue — Lee's early warning system.

A third layer ships on top: when Lee wants the full story, he clicks "Deeper explanation" on any step and a second Claude call produces a conversational narrative — the AI walks through its thinking the way a colleague would. This is kept on-demand so the baseline classification cost stays bounded. Lee pays for depth only when he wants it.

The fourth connection is the killer one: this reasoning data feeds the already-built Learning Engine. When Lee rejects or edits a proposal, he can now tag *which reasoning step* was wrong (`wrong_matching`, `wrong_routing`, `wrong_voice_fit`) — not just the proposal as a whole. Over 30 days this produces calibration metrics: *stated confidence vs. actual approval rate, per step, per category*. When the AI says "95% confident on priority for owner relations" but Lee edits it 40% of the time, the gap is visible and fixable. This is the foundation for the 95% autonomy gate: auto-send only unlocks when a category's proposal confidence **and** every reasoning step are calibrated above 95%.

**Core principle: every AI decision becomes inspectable, every bug becomes a 30-second diagnosis, and every correction becomes training data.**

---

## 2. Confirmed Decisions

| Decision | Choice | Notes |
|---|---|---|
| Reasoning generation | Two-tier | Structured JSON inside classification call + on-demand narrative via second Claude call |
| Number of steps | 6 | matching, is_incident, classification, priority, routing, voice_fit |
| Log surface | Standalone `/reasoning` page | New sidebar entry after `/learning`, before `/settings` |
| Low-confidence flag | Red dot / red badge | Triggers when any step `< 70` confidence |
| Scope | Full backend upgrade + trace | Build real matcher + routing AI + voice_fit AI alongside the reasoning trace |
| Matching signal cascade | Deterministic, no LLM | (a) Lark thread `root_id` exact match → (b) unit + cluster match within 72h → (c) ticket ID match |
| Confidence model | Two separate scalars | `ai_confidence` = proposal confidence (existing). `min_reasoning_confidence` = derived min across 6 trace rows (new). Red badge uses the second; autonomy gate requires both `>= 95`. |
| Routing target set | 5 PICs | Fatihah (OM), Fariha (Maintenance), Adam (OOE Lead), Linda (Owner Relations), David (Housekeeping). Extensible via a seed table later. |
| Voice fit fallback | Keep old formula | If the AI voice_fit step fails or returns invalid, fall back to `confidence >= 95 && priority !== 'P1'`. No regression. |
| Revision replay | Classification is one-shot | Reasoning trace is captured at v1 classification only. `ReasoningPanel` label explicitly says "reasoning for original classification, not current proposal version". |
| Learning Engine feedback | New column | `proposal_revisions.reasoning_feedback_tags text[]` separate from existing proposal-level `feedback_tags`. Values: `wrong_matching`, `wrong_classification`, `wrong_priority`, `wrong_routing`, `wrong_voice_fit`. |
| Narrative caching | Write-once | `narrative_text` stored on the trace row after first generation. Subsequent clicks return cached text. Re-generate only if Lee explicitly clicks "regenerate narrative". |
| Matcher conservatism | Prefer new over merge | When signals conflict or are weak, default to `decision: 'new'`. A false-new is recoverable by Lee manual merge; a false-merge corrupts the incident timeline. |
| Token cost ceiling | `max_tokens: 1000` | Classification call budget triples from 300 → 1000 to accommodate 6 reasoning blocks. |

---

## 3. User Flow

### 3.1 Message arrives → 6 trace rows written

```
Lark webhook fires
  → normaliseLarkMessage() produces MessageContext
  → findMatchingIncident(ctx)   ← NEW, deterministic, no LLM
        → signal cascade: root_id → unit+cluster → ticket ID
        → returns { decision: 'new' | 'merge', target_id?, signal, confidence, reasoning }
        → matching trace row INSERTED immediately (even before classification)

  IF decision === 'merge':
     → append raw_content to incidents[target_id].timeline
     → increment incidents[target_id].merge_count
     → no new incident created
     → no classification re-run (the existing incident keeps its original reasoning)
     → exit flow

  IF decision === 'new':
     → classifyMessage(ctx, matchResult)   ← EXPANDED prompt
           → returns 5 additional step objects:
             { is_incident, classification, priority, routing, voice_fit }
             each with { decision, confidence, reasoning }
     → createIncident() with assigned_to = routing.decision
     → 5 trace rows INSERTED in one transaction
     → trigger recomputes incidents.min_reasoning_confidence
     → IF min_reasoning_confidence < 70:
          → incident gets red dot in Command Center queue
     → analyseIncident() → proposeAction() runs as today
     → proposeAction prompt now reads incidents.assigned_to to name the PIC
```

### 3.2 Lee opens an incident → sees reasoning above proposal

```
┌────────────────────────────────────────────────────────┐
│  ◂  B-15-06 — Owner chasing 50% occupancy      [C10]   │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌── REASONING TRACE ─────────────────── v1 original ──┐
│  │                                                    │
│  │  min confidence  45%  ⚠                            │
│  │                                                    │
│  │  ▸ 1. Matching         45% ⚠   new                 │
│  │  ▸ 2. Is incident      92%     true                │
│  │  ▸ 3. Classification   88%     owner_relations     │
│  │  ▸ 4. Priority         78%     P2                  │
│  │  ▸ 5. Routing          91%     Linda               │
│  │  ▸ 6. Voice fit        85%     needs Lee           │
│  │                                                    │
│  │  ℹ Reasoning is for original classification,       │
│  │    not current proposal revision.                  │
│  └────────────────────────────────────────────────────┘
│                                                        │
│  ┌── PROPOSED ACTION ───────────────── v1 of 1 ── 88% ┐
│  │  (existing ProposalRevisionPanel renders here)     │
│  └────────────────────────────────────────────────────┘
└────────────────────────────────────────────────────────┘
```

`ReasoningPanel` sits **above** `ProposalRevisionPanel` inside `IncidentDetail.tsx`. Default state: header row with min confidence badge + 6 collapsed step rows. Click a step row to expand.

### 3.3 Lee expands a low-confidence step

```
┌── REASONING TRACE ─────────────────── v1 original ──┐
│                                                    │
│  min confidence  45%  ⚠                            │
│                                                    │
│  ▾ 1. Matching         45% ⚠   new                 │
│  ┌─ signal ───────────────────────────────────────┐ │
│  │ Cascade result: no thread root_id match,       │ │
│  │ unit B-15-06 appears in 1 open incident in C10 │ │
│  │ (#INC-2478, last activity 2h ago) but          │ │
│  │ keyword overlap only 18%. Defaulted to 'new'   │ │
│  │ per conservatism rule.                         │ │
│  │                                                │ │
│  │ [Deeper explanation]   [Tag as wrong]          │ │
│  └────────────────────────────────────────────────┘ │
│                                                    │
│  ▸ 2. Is incident      92%     true                │
│  ▸ 3. Classification   88%     owner_relations     │
│  ...                                               │
└────────────────────────────────────────────────────┘
```

**Deeper explanation** button → fires `POST /api/incidents/[id]/reasoning/narrative` with `{ step: 'matching' }`. Shows a loading spinner. On success, replaces the short reasoning with the longer narrative and caches it. Subsequent clicks toggle open/close without re-firing.

**Tag as wrong** button → opens a small pill picker with the 5 tags (`wrong_matching`, etc.). Selection calls `POST /api/incidents/[id]/reasoning/feedback` → writes to `proposal_revisions.reasoning_feedback_tags` on the current active revision.

### 3.4 Command Center queue — red dot

In the incident list (`components/command/CommandCenter.tsx`), each row renders its existing info (title, cluster, severity, timestamp). Rows where `min_reasoning_confidence < 70` get a small red dot before the title:

```
  ● B-15-06 — Owner chasing 50% occupancy      C10  P2  12:46
    A1-21-09 — Water bill abnormally high       RC   P3  11:22
  ● Lift stuck floor 3                          VC   P1  11:05
```

The red dot is a 6px filled circle in `#E05252` (error color from the design system). Hover → tooltip: *"Low reasoning confidence — one or more steps below 70%"*.

The sidebar's existing Command badge (`components/layout/Sidebar.tsx:84-87`, yellow pulse for awaiting count) gains a second overlaid dot when any queued incident has `min_reasoning_confidence < 70`.

### 3.5 `/reasoning` page

```
┌────────────────────────────────────────────────────────┐
│  /reasoning                                            │
├────────────────────────────────────────────────────────┤
│                                                        │
│  ┌ 1,247 ┐ ┌ 892   ┐ ┌ 143   ┐ ┌ avg 84% ┐             │
│  │ total │ │ high  │ │ low   │ │ confi-  │             │
│  │ trace │ │ conf  │ │ conf  │ │ dence   │             │
│  └───────┘ └───────┘ └───────┘ └─────────┘             │
│                                                        │
│  Filters:                                              │
│  Step:  [ All ] [ matching ] [ classification ] [ … ]  │
│  Band:  [ All ] [ <70 ] [ 70-89 ] [ 90+ ]              │
│  Category: [ All ▾ ]    Cluster: [ All ▾ ]             │
│                                                        │
│  ┌── CALIBRATION ─────────────────────────────────┐    │
│  │  Stated confidence vs actual approval rate,    │    │
│  │  per step, per category                        │    │
│  │                                                │    │
│  │  Owner relations                                │   │
│  │    Matching       stated 87%  actual 64%  ▼23  │    │
│  │    Classification stated 91%  actual 88%  ▼3   │    │
│  │    Priority       stated 78%  actual 62%  ▼16  │    │
│  │    Routing        stated 94%  actual 91%  ▼3   │    │
│  │    Voice fit      stated 85%  actual 82%  ▼3   │    │
│  │                                                │    │
│  │  Maintenance                                    │   │
│  │    Matching       stated 92%  actual 94%  ▲2   │    │
│  │    ...                                         │    │
│  └────────────────────────────────────────────────┘    │
│                                                        │
│  ┌── TRACE LOG ───────────────────────────────────┐    │
│  │ B-15-06 — Owner chasing          matching  45% │    │
│  │ A2-11-04 — Water pressure low    priority  52% │    │
│  │ VC lobby — Lift stuck            routing   61% │    │
│  │ ...                                            │    │
│  └────────────────────────────────────────────────┘    │
└────────────────────────────────────────────────────────┘
```

Each log row shows the incident + the **lowest-confidence step** as the headline, sorted by confidence ascending (worst first). Click a row → navigates to the incident detail page with `ReasoningPanel` pre-expanded on that step.

### 3.6 On-demand narrative

When Lee clicks "Deeper explanation" on any step, a second Claude call fires with a prompt like:

> You previously classified incident X in step Y with confidence Z and this short reasoning: {short}. The input signal was: {input_signal}. Explain your thinking in 3-5 sentences, as if walking a colleague through the decision. Start with what you saw, what you considered, and why you landed here instead of the alternatives.

The response is written to `incident_reasoning_traces.narrative_text` and `narrative_generated_at`. Subsequent clicks return the cached text. A "Regenerate narrative" affordance is available but requires an explicit click (not accidental).

---

## 4. Schema

### 4.1 New migration

**File:** `supabase/migrations/20260411000000_reasoning_trace_and_routing.sql`

```sql
-- ============================================================
-- Reasoning Trace + Backend Upgrade
-- Adds: per-step reasoning trace table, derived min confidence
-- column, structured assigned_to column, and reasoning-level
-- Learning Engine feedback column.
-- ============================================================

-- 1. Per-step reasoning trace
CREATE TABLE IF NOT EXISTS incident_reasoning_traces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  step_name text NOT NULL CHECK (step_name IN (
    'matching', 'is_incident', 'classification', 'priority', 'routing', 'voice_fit'
  )),
  step_order smallint NOT NULL,  -- 1..6 for stable ordering in UI

  -- Decision output (shape varies by step)
  decision text,                 -- matching: 'new'|'merge'. classification: category. priority: 'P1'|'P2'|'P3'. routing: PIC name. voice_fit: 'lee'|'delegate'. is_incident: 'true'|'false'.
  decision_detail jsonb,         -- step-specific extras (e.g. matching: {target_id, signal_name, keyword_overlap})

  -- Per-step confidence
  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),

  -- Reasoning text
  reasoning_text text NOT NULL,           -- one-sentence short reasoning written inline by classify call
  narrative_text text,                    -- nullable, populated on-demand
  narrative_generated_at timestamptz,

  -- Generation metadata
  model_version text,                     -- e.g. 'claude-sonnet-4-6'
  generated_by text CHECK (generated_by IN ('deterministic', 'llm')),  -- matching = deterministic, others = llm
  input_signal jsonb,                     -- raw input snapshot for debugging

  created_at timestamptz DEFAULT now(),

  UNIQUE(incident_id, step_name)
);

CREATE INDEX idx_reasoning_incident ON incident_reasoning_traces(incident_id);
CREATE INDEX idx_reasoning_low_conf ON incident_reasoning_traces(confidence)
  WHERE confidence < 70;
CREATE INDEX idx_reasoning_step_conf ON incident_reasoning_traces(step_name, confidence);
CREATE INDEX idx_reasoning_created ON incident_reasoning_traces(created_at DESC);

-- 2. Derived fields on incidents
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS min_reasoning_confidence integer,
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS merged_from_incident_id uuid REFERENCES incidents(id),
  ADD COLUMN IF NOT EXISTS merge_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_incidents_min_reasoning
  ON incidents(min_reasoning_confidence)
  WHERE min_reasoning_confidence IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to
  ON incidents(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 3. Trigger: recompute min_reasoning_confidence on trace insert/update
CREATE OR REPLACE FUNCTION recompute_min_reasoning_confidence()
RETURNS trigger AS $$
BEGIN
  UPDATE incidents
    SET min_reasoning_confidence = (
      SELECT MIN(confidence)
        FROM incident_reasoning_traces
       WHERE incident_id = NEW.incident_id
    )
    WHERE id = NEW.incident_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_min_conf ON incident_reasoning_traces;
CREATE TRIGGER trg_recompute_min_conf
  AFTER INSERT OR UPDATE OF confidence ON incident_reasoning_traces
  FOR EACH ROW EXECUTE FUNCTION recompute_min_reasoning_confidence();

-- 4. Learning Engine: reasoning-step feedback (separate from proposal-level)
ALTER TABLE proposal_revisions
  ADD COLUMN IF NOT EXISTS reasoning_feedback_tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_revisions_reasoning_feedback
  ON proposal_revisions USING gin(reasoning_feedback_tags)
  WHERE array_length(reasoning_feedback_tags, 1) > 0;

-- 5. RLS
ALTER TABLE incident_reasoning_traces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON incident_reasoning_traces
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Seed: known PICs (referenced by routing step)
CREATE TABLE IF NOT EXISTS routing_pics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  role text NOT NULL,
  default_categories text[] DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO routing_pics (name, role, default_categories) VALUES
  ('Fatihah', 'Operations Manager', ARRAY['onboarding', 'move_in', 'move_out', 'access_card']),
  ('Fariha',  'Maintenance Lead',   ARRAY['air_con', 'plumbing', 'electrical', 'lift', 'door_lock', 'water_heater', 'general_repair', 'structural']),
  ('Adam',    'OOE Lead',           ARRAY['safety', 'eviction', 'complaint']),
  ('Linda',   'Owner Relations',    ARRAY['payment', 'complaint']),  -- owner-facing complaints
  ('David',   'Housekeeping',       ARRAY['cleaning', 'hygiene', 'pest'])
ON CONFLICT (name) DO NOTHING;

ALTER TABLE routing_pics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON routing_pics FOR ALL USING (true) WITH CHECK (true);
```

### 4.2 Schema notes

- **Why `step_order` is stored even though it's derivable:** UI renders steps 1..6 in fixed order. Storing the order avoids a hardcoded mapping in the frontend and lets us re-order steps later without a migration.
- **Why `decision_detail jsonb`:** each step has different extras. Matching stores `{target_id, signal_name, keyword_overlap}`. Classification stores `{severity, problem_type}`. Keeping it as JSONB avoids a wide table.
- **Why `generated_by` distinguishes `deterministic` vs `llm`:** matching is rule-based (no model version to record meaningfully). The column lets `/reasoning` filter out matching rows when computing LLM calibration metrics.
- **Why `merged_from_incident_id`:** when the matcher returns `decision: 'merge'`, we still want to record the source message. Instead of creating a full incident row, we add a timeline entry AND optionally create a lightweight "merge record" pointing at the target. `merge_count` on the target increments.
- **Trigger is `AFTER INSERT OR UPDATE OF confidence`:** not all updates need to recompute (narrative_text updates don't touch confidence). Scoping the trigger avoids wasted writes.

---

## 5. Core Functions

### 5.1 Incident matcher

```typescript
// lib/matching/incident-matcher.ts

import { supabaseAdmin } from '@/lib/supabase-admin'
import { extractKeywords } from '@/lib/incidents'

export interface MatchResult {
  decision: 'new' | 'merge'
  target_id?: string
  signal: 'root_id' | 'unit_cluster' | 'ticket_id' | 'none'
  confidence: number
  reasoning: string
  decision_detail: Record<string, unknown>
}

const MERGE_WINDOW_HOURS = 72

/**
 * Deterministic matcher. No LLM. Runs before classifyMessage.
 *
 * Signal cascade:
 *   1. Lark thread root_id exact match → confidence 95
 *   2. Unit identifier + cluster match within 72h + keyword overlap >= 40% → confidence 75-90
 *   3. Ticket ID (e.g. BLV-RQ-XXXX) exact match → confidence 92
 *   (no match) → decision 'new', confidence 90 (high confidence it's a new incident)
 *
 * Conservatism rule: when signals are weak or conflicting, default to 'new'.
 */
export async function findMatchingIncident(input: {
  cluster?: string
  raw_content: string
  lark_root_id?: string
  sender_open_id?: string
}): Promise<MatchResult> {

  // Signal 1: Lark thread root_id
  if (input.lark_root_id) {
    const { data } = await supabaseAdmin
      .from('incidents')
      .select('id')
      .eq('lark_root_id', input.lark_root_id)
      .in('status', ['new', 'awaiting_lee', 'acting'])
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

  // Signal 2: ticket ID match (BLV-RQ-XXXX, BLV-IN-XXXX, etc.)
  const ticketMatch = input.raw_content.match(/\bBLV-[A-Z]{2}-\d{6,}\b/)
  if (ticketMatch) {
    const ticketId = ticketMatch[0]
    const { data } = await supabaseAdmin
      .from('incidents')
      .select('id')
      .contains('thread_keywords', [ticketId])
      .in('status', ['new', 'awaiting_lee', 'acting'])
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
      .in('status', ['new', 'awaiting_lee', 'acting'])
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })

    if (candidates && candidates.length > 0) {
      // Compute keyword overlap with best candidate
      const best = candidates[0]
      const overlap = computeKeywordOverlap(kws, best.thread_keywords ?? [])

      // Conservatism: only merge if overlap >= 40%
      if (overlap >= 0.4) {
        const conf = Math.round(75 + overlap * 15)  // 75-90
        return {
          decision: 'merge',
          target_id: best.id,
          signal: 'unit_cluster',
          confidence: conf,
          reasoning: `Unit ${unitKw} in cluster ${input.cluster} matches existing incident ${best.id} (keyword overlap ${Math.round(overlap * 100)}%).`,
          decision_detail: { unit: unitKw, cluster: input.cluster, keyword_overlap: overlap, target_id: best.id },
        }
      }

      // Weak signal — log but default to new
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

function computeKeywordOverlap(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0
  const setA = new Set(a.map(k => k.toLowerCase()))
  const setB = new Set(b.map(k => k.toLowerCase()))
  let intersection = 0
  for (const k of setA) if (setB.has(k)) intersection++
  const union = setA.size + setB.size - intersection
  return union > 0 ? intersection / union : 0
}
```

### 5.2 Reasoning prompt builder

```typescript
// lib/reasoning/prompt-builder.ts

import type { MatchResult } from '@/lib/matching/incident-matcher'

/**
 * Build the expanded classification prompt that returns all 5 LLM reasoning
 * steps in one JSON response. Matching is NOT included here — it runs
 * deterministically before this and is passed in as context.
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
- Reasoning: ${matchResult.reasoning}
${matchResult.decision === 'merge' ? `- Merge target: ${matchResult.target_id}` : ''}`

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
- "Water bill abnormally high RM800 — RC A1-21-09"

You MUST return ONLY valid JSON with this exact shape — every step has its own confidence and one-sentence reasoning. DO NOT include the matching step (already done). DO include all 5 remaining steps:

{
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

Each reasoning MUST be one sentence (max ~20 words). Each confidence MUST be 0-100 integer.`

  const user = `Source: ${source}\nMessage: ${message}`

  return { system, user }
}
```

### 5.3 Trace writer

```typescript
// lib/reasoning/trace-writer.ts

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
  model_version?: string
  generated_by: 'deterministic' | 'llm'
  input_signal?: Record<string, unknown>
}

/**
 * Write a single trace row. Trigger recomputes incidents.min_reasoning_confidence automatically.
 */
export async function writeTrace(row: TraceRowInput): Promise<void> {
  const { error } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .upsert({
      incident_id: row.incident_id,
      step_name: row.step_name,
      step_order: row.step_order,
      decision: row.decision,
      decision_detail: row.decision_detail ?? {},
      confidence: Math.max(0, Math.min(100, Math.round(row.confidence))),
      reasoning_text: row.reasoning_text,
      model_version: row.model_version,
      generated_by: row.generated_by,
      input_signal: row.input_signal ?? {},
    }, {
      onConflict: 'incident_id,step_name',
    })

  if (error) {
    console.error('[reasoning:writeTrace]', error.message)
    throw error
  }
}

/**
 * Write all 6 trace rows for an incident in one batch.
 */
export async function writeFullTrace(rows: TraceRowInput[]): Promise<void> {
  if (rows.length !== 6) {
    console.warn('[reasoning:writeFullTrace] expected 6 rows, got', rows.length)
  }
  const { error } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .upsert(rows.map(r => ({
      incident_id: r.incident_id,
      step_name: r.step_name,
      step_order: r.step_order,
      decision: r.decision,
      decision_detail: r.decision_detail ?? {},
      confidence: Math.max(0, Math.min(100, Math.round(r.confidence))),
      reasoning_text: r.reasoning_text,
      model_version: r.model_version,
      generated_by: r.generated_by,
      input_signal: r.input_signal ?? {},
    })), { onConflict: 'incident_id,step_name' })

  if (error) {
    console.error('[reasoning:writeFullTrace]', error.message)
    throw error
  }
}
```

### 5.4 Narrative generator (on-demand)

```typescript
// lib/reasoning/narrative-generator.ts

import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ReasoningStepName } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

/**
 * Generate a conversational narrative for one reasoning step.
 * Called on-demand from "Deeper explanation" button.
 * Writes narrative_text + narrative_generated_at to the trace row.
 */
export async function generateNarrative(
  incidentId: string,
  stepName: ReasoningStepName
): Promise<string> {
  // Load the trace row + incident context
  const { data: trace } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('*')
    .eq('incident_id', incidentId)
    .eq('step_name', stepName)
    .single()

  if (!trace) throw new Error(`Trace not found: ${incidentId} / ${stepName}`)

  // Cache hit — return existing narrative
  if (trace.narrative_text) return trace.narrative_text

  const { data: incident } = await supabaseAdmin
    .from('incidents')
    .select('title, raw_content, cluster, category, priority, severity')
    .eq('id', incidentId)
    .single()

  if (!incident) throw new Error(`Incident not found: ${incidentId}`)

  const prompt = `You previously classified an incident. Now explain one specific step of your reasoning in a conversational, colleague-to-colleague tone. 3-5 sentences max.

INCIDENT:
- Cluster: ${incident.cluster}
- Title: ${incident.title}
- Raw message: ${incident.raw_content}

YOUR PRIOR DECISION FOR STEP "${stepName}":
- Decision: ${trace.decision}
- Confidence: ${trace.confidence}%
- Short reasoning: ${trace.reasoning_text}
- Input signal: ${JSON.stringify(trace.input_signal)}

Walk through your thinking: what did you see, what alternatives did you consider, and why did you land on "${trace.decision}" instead? Be honest about the uncertainty — if confidence was low, say why.

Return ONLY the narrative text. No JSON, no headers.`

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{ role: 'user', content: prompt }],
  })

  const narrative = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''

  await supabaseAdmin
    .from('incident_reasoning_traces')
    .update({
      narrative_text: narrative,
      narrative_generated_at: new Date().toISOString(),
    })
    .eq('incident_id', incidentId)
    .eq('step_name', stepName)

  return narrative
}
```

### 5.5 Rewritten `classifyMessage`

```typescript
// lib/incidents.ts — REPLACE lines 17-78

import { findMatchingIncident, type MatchResult } from '@/lib/matching/incident-matcher'
import { buildReasoningClassificationPrompt } from '@/lib/reasoning/prompt-builder'
import type { ReasoningStepName } from './types'

export interface ClassifyResult {
  // Flat convenience fields (unchanged from today for downstream compatibility)
  agent: string
  problem_type: string
  priority: Priority
  severity: Severity
  title: string
  is_incident: boolean
  category: string
  assigned_to: string | null
  voice_fit: 'lee' | 'delegate'

  // New: full reasoning trace (to be written after createIncident)
  match_result: MatchResult
  reasoning_steps: {
    step_name: ReasoningStepName
    step_order: number
    decision: string
    decision_detail: Record<string, unknown>
    confidence: number
    reasoning_text: string
    generated_by: 'deterministic' | 'llm'
    input_signal: Record<string, unknown>
  }[]
}

export async function classifyMessage(
  content: string,
  source: string,
  groupContext?: string,
  context?: { cluster?: string; lark_root_id?: string; sender_open_id?: string }
): Promise<ClassifyResult> {

  // Short-reply early exit (unchanged)
  if (content.trim().length < 15) {
    return buildEmptyClassifyResult(content)
  }

  // STEP 1: Deterministic matching (runs before LLM)
  const matchResult = await findMatchingIncident({
    cluster: context?.cluster,
    raw_content: content,
    lark_root_id: context?.lark_root_id,
    sender_open_id: context?.sender_open_id,
  })

  // Load learned reasoning rules (parallel to proposeAction's learned rules)
  const learnedRules = await loadReasoningRulesForCategory(/* detected later; empty at this point */)

  // STEP 2-6: Single LLM call returns all 5 remaining steps
  const { system, user } = buildReasoningClassificationPrompt(
    content, source, groupContext, matchResult, learnedRules
  )

  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: user }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const parsed = parseAIJson(text) as Record<string, any>

    // Validate all 5 LLM steps present; fall back if malformed
    const required = ['is_incident', 'classification', 'priority', 'routing', 'voice_fit']
    for (const step of required) {
      if (!parsed[step] || typeof parsed[step].confidence !== 'number') {
        throw new Error(`Missing or malformed step: ${step}`)
      }
    }

    // Voice fit fallback: if the AI step errors or returns invalid, use old formula later
    const voiceFit: 'lee' | 'delegate' = parsed.voice_fit.decision === 'delegate' ? 'delegate' : 'lee'

    const reasoningSteps: ClassifyResult['reasoning_steps'] = [
      {
        step_name: 'matching',
        step_order: 1,
        decision: matchResult.decision,
        decision_detail: matchResult.decision_detail,
        confidence: matchResult.confidence,
        reasoning_text: matchResult.reasoning,
        generated_by: 'deterministic',
        input_signal: { cluster: context?.cluster, root_id: context?.lark_root_id, content_preview: content.slice(0, 100) },
      },
      {
        step_name: 'is_incident',
        step_order: 2,
        decision: String(parsed.is_incident.decision),
        decision_detail: {},
        confidence: parsed.is_incident.confidence,
        reasoning_text: parsed.is_incident.reasoning ?? '',
        generated_by: 'llm',
        input_signal: { content_preview: content.slice(0, 200) },
      },
      {
        step_name: 'classification',
        step_order: 3,
        decision: parsed.classification.decision,
        decision_detail: parsed.classification.detail ?? {},
        confidence: parsed.classification.confidence,
        reasoning_text: parsed.classification.reasoning ?? '',
        generated_by: 'llm',
        input_signal: { content_preview: content.slice(0, 200) },
      },
      {
        step_name: 'priority',
        step_order: 4,
        decision: parsed.priority.decision,
        decision_detail: {},
        confidence: parsed.priority.confidence,
        reasoning_text: parsed.priority.reasoning ?? '',
        generated_by: 'llm',
        input_signal: {},
      },
      {
        step_name: 'routing',
        step_order: 5,
        decision: parsed.routing.decision,
        decision_detail: {},
        confidence: parsed.routing.confidence,
        reasoning_text: parsed.routing.reasoning ?? '',
        generated_by: 'llm',
        input_signal: { available_pics: ['Fatihah', 'Fariha', 'Adam', 'Linda', 'David'] },
      },
      {
        step_name: 'voice_fit',
        step_order: 6,
        decision: voiceFit,
        decision_detail: {},
        confidence: parsed.voice_fit.confidence,
        reasoning_text: parsed.voice_fit.reasoning ?? '',
        generated_by: 'llm',
        input_signal: {},
      },
    ]

    const classification = parsed.classification
    const detail = classification.detail ?? {}

    return {
      agent: detail.agent ?? 'coo',
      problem_type: detail.problem_type ?? 'ops_maintenance',
      priority: parsed.priority.decision,
      severity: detail.severity ?? 'YELLOW',
      title: detail.title ?? content.slice(0, 80),
      is_incident: Boolean(parsed.is_incident.decision),
      category: classification.decision ?? 'other',
      assigned_to: parsed.routing.decision ?? null,
      voice_fit: voiceFit,
      match_result: matchResult,
      reasoning_steps: reasoningSteps,
    }

  } catch (error) {
    console.error('[incidents:classify]', error instanceof Error ? error.message : 'Unknown')
    // Fallback: use old-style defaults, voice_fit falls back to hardcoded rule later
    return buildFallbackClassifyResult(content, matchResult)
  }
}

function buildEmptyClassifyResult(content: string): ClassifyResult {
  return {
    agent: 'coo', problem_type: 'none', priority: 'P3', severity: 'GREEN',
    title: '', is_incident: false, category: 'other', assigned_to: null, voice_fit: 'delegate',
    match_result: { decision: 'new', signal: 'none', confidence: 100, reasoning: 'Message too short to classify.', decision_detail: {} },
    reasoning_steps: [],
  }
}

function buildFallbackClassifyResult(content: string, matchResult: MatchResult): ClassifyResult {
  return {
    agent: 'coo', problem_type: 'ops_maintenance', priority: 'P3', severity: 'YELLOW',
    title: content.slice(0, 80), is_incident: false, category: 'other',
    assigned_to: null, voice_fit: 'lee',
    match_result: matchResult,
    reasoning_steps: [],
  }
}

async function loadReasoningRulesForCategory(_category?: string): Promise<string[]> {
  // Stub for now — populated by getCategoryReasoningRulesForPrompt in 5.6
  return []
}
```

### 5.6 Reasoning rules injection (Learning Engine parallel)

```typescript
// lib/learning/reasoning-feedback.ts (NEW, parallel to category-feedback.ts)

import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Extract reasoning-level correction rules for a category.
 * Injected into the classifyMessage prompt so the AI learns from past reasoning mistakes.
 *
 * Example: if Lee tagged 'wrong_routing' on 5 owner_relations incidents where AI picked Adam
 * instead of Linda, this returns a rule like "In owner_relations, route to Linda not Adam".
 */
export async function getCategoryReasoningRulesForPrompt(
  category: string
): Promise<string[]> {
  const { data: rows } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      reasoning_feedback_tags,
      feedback_text,
      incidents!inner (category, assigned_to)
    `)
    .eq('incidents.category', category)
    .not('reasoning_feedback_tags', 'eq', '{}')
    .order('created_at', { ascending: false })
    .limit(50)

  if (!rows || rows.length === 0) return []

  // Group by tag, collect frequency + example context
  const tagCounts = new Map<string, { count: number; examples: string[] }>()
  for (const row of rows) {
    for (const tag of (row.reasoning_feedback_tags ?? [])) {
      const e = tagCounts.get(tag) ?? { count: 0, examples: [] }
      e.count++
      if (e.examples.length < 2 && row.feedback_text) e.examples.push(row.feedback_text)
      tagCounts.set(tag, e)
    }
  }

  const rules: string[] = []
  for (const [tag, data] of tagCounts.entries()) {
    if (data.count >= 3) {
      const example = data.examples[0] ?? ''
      rules.push(`${tag.replace('wrong_', '')}: ${example}`.slice(0, 200))
    }
  }

  return rules.slice(0, 5)
}
```

### 5.7 `submitReasoningFeedback`

```typescript
// lib/learning/revision-manager.ts — ADD this function

export async function submitReasoningFeedback(
  incidentId: string,
  tags: string[]  // values: 'wrong_matching' | 'wrong_classification' | 'wrong_priority' | 'wrong_routing' | 'wrong_voice_fit'
): Promise<void> {
  // Append to the current active (non-final) revision
  const { data: active } = await supabaseAdmin
    .from('proposal_revisions')
    .select('id, reasoning_feedback_tags')
    .eq('incident_id', incidentId)
    .order('version_number', { ascending: false })
    .limit(1)
    .single()

  if (!active) throw new Error('No revision found for incident')

  const merged = Array.from(new Set([...(active.reasoning_feedback_tags ?? []), ...tags]))

  const { error } = await supabaseAdmin
    .from('proposal_revisions')
    .update({ reasoning_feedback_tags: merged })
    .eq('id', active.id)

  if (error) throw error
}
```

---

## 6. API Routes

### 6.1 Incident-scoped reasoning

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/incidents/[id]/reasoning` | Get all 6 trace rows for an incident |
| POST | `/api/incidents/[id]/reasoning/narrative` | Generate narrative for one step (body: `{ step }`) |
| POST | `/api/incidents/[id]/reasoning/feedback` | Submit reasoning-step feedback tags (body: `{ tags: string[] }`) |

```typescript
// app/api/incidents/[id]/reasoning/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('*')
    .eq('incident_id', id)
    .order('step_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ traces: data ?? [] })
}
```

```typescript
// app/api/incidents/[id]/reasoning/narrative/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { generateNarrative } from '@/lib/reasoning/narrative-generator'
import type { ReasoningStepName } from '@/lib/types'

const VALID_STEPS: ReasoningStepName[] = [
  'matching', 'is_incident', 'classification', 'priority', 'routing', 'voice_fit'
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const step = body.step as ReasoningStepName

  if (!VALID_STEPS.includes(step)) {
    return NextResponse.json({ error: 'invalid step' }, { status: 400 })
  }

  try {
    const narrative = await generateNarrative(id, step)
    return NextResponse.json({ narrative })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

```typescript
// app/api/incidents/[id]/reasoning/feedback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { submitReasoningFeedback } from '@/lib/learning/revision-manager'

const VALID_TAGS = [
  'wrong_matching', 'wrong_classification', 'wrong_priority', 'wrong_routing', 'wrong_voice_fit'
]

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const body = await req.json()
  const tags = Array.isArray(body.tags) ? body.tags : []

  const invalid = tags.filter((t: string) => !VALID_TAGS.includes(t))
  if (invalid.length > 0) {
    return NextResponse.json({ error: `invalid tags: ${invalid.join(', ')}` }, { status: 400 })
  }

  try {
    await submitReasoningFeedback(id, tags)
    return NextResponse.json({ success: true })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
```

### 6.2 Global `/reasoning` feed

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/reasoning` | Paginated trace log feed with filters |
| GET | `/api/reasoning/calibration` | Per-step, per-category stated-vs-actual calibration metrics |
| GET | `/api/reasoning/stats` | Summary stat cards (totals, avg confidence, low-conf count) |

```typescript
// app/api/reasoning/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const step = url.searchParams.get('step')          // 'matching' | ...
  const band = url.searchParams.get('band')          // 'low' | 'mid' | 'high'
  const category = url.searchParams.get('category')
  const cluster = url.searchParams.get('cluster')
  const limit = parseInt(url.searchParams.get('limit') ?? '50', 10)

  let q = supabaseAdmin
    .from('incident_reasoning_traces')
    .select(`
      *,
      incidents!inner (id, title, cluster, category, severity, priority, created_at)
    `)
    .order('confidence', { ascending: true })
    .limit(limit)

  if (step) q = q.eq('step_name', step)
  if (band === 'low') q = q.lt('confidence', 70)
  else if (band === 'mid') q = q.gte('confidence', 70).lt('confidence', 90)
  else if (band === 'high') q = q.gte('confidence', 90)
  if (category) q = q.eq('incidents.category', category)
  if (cluster) q = q.eq('incidents.cluster', cluster)

  const { data, error } = await q

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ traces: data ?? [] })
}
```

```typescript
// app/api/reasoning/calibration/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

/**
 * Per-step, per-category calibration.
 * For each (step, category) combination:
 *   - stated_confidence = avg(trace.confidence) over last 30 days
 *   - actual_approval_rate = (v1 approvals) / (total decided) in same category
 *   - gap = stated - actual
 */
export async function GET() {
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()

  const { data: traces } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select(`
      step_name,
      confidence,
      incidents!inner (id, category)
    `)
    .eq('generated_by', 'llm')
    .gte('created_at', cutoff)

  const { data: revisions } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      outcome,
      version_number,
      incidents!inner (category)
    `)
    .eq('is_final', true)
    .gte('decided_at', cutoff)

  // Group traces: (step, category) → avg confidence
  const traceMap = new Map<string, { sum: number; count: number }>()
  for (const t of traces ?? []) {
    const key = `${t.step_name}|${(t as any).incidents.category}`
    const e = traceMap.get(key) ?? { sum: 0, count: 0 }
    e.sum += t.confidence
    e.count++
    traceMap.set(key, e)
  }

  // Group revisions: category → approval rate
  const catMap = new Map<string, { approved: number; total: number }>()
  for (const r of revisions ?? []) {
    const cat = (r as any).incidents.category
    const e = catMap.get(cat) ?? { approved: 0, total: 0 }
    e.total++
    if (r.outcome === 'approved' && r.version_number === 1) e.approved++
    catMap.set(cat, e)
  }

  const rows: Array<{ step: string; category: string; stated: number; actual: number; gap: number }> = []
  for (const [key, { sum, count }] of traceMap.entries()) {
    const [step, category] = key.split('|')
    const stated = Math.round(sum / count)
    const catRev = catMap.get(category)
    const actual = catRev && catRev.total > 0 ? Math.round((catRev.approved / catRev.total) * 100) : 0
    rows.push({ step, category, stated, actual, gap: stated - actual })
  }

  rows.sort((a, b) => b.gap - a.gap)

  return NextResponse.json({ calibration: rows })
}
```

```typescript
// app/api/reasoning/stats/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('incident_reasoning_traces')
    .select('confidence')

  if (!data) return NextResponse.json({ total: 0, high: 0, low: 0, avg: 0 })

  const total = data.length
  const high = data.filter(d => d.confidence >= 90).length
  const low = data.filter(d => d.confidence < 70).length
  const avg = total > 0 ? Math.round(data.reduce((a, d) => a + d.confidence, 0) / total) : 0

  return NextResponse.json({ total, high, low, avg })
}
```

---

## 7. UI Components

### 7.1 `ReasoningPanel.tsx`

**File:** `components/command/ReasoningPanel.tsx` (new, client component)

**Renders:** above `ProposalRevisionPanel` inside `IncidentDetail.tsx`.

**Shape:**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { StepRow } from '@/components/reasoning/StepRow'
import type { ReasoningTrace, ReasoningStepName } from '@/lib/types'

interface ReasoningPanelProps {
  incidentId: string
}

export function ReasoningPanel({ incidentId }: ReasoningPanelProps) {
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [expandedStep, setExpandedStep] = useState<ReasoningStepName | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/incidents/${incidentId}/reasoning`)
      .then(r => r.json())
      .then(d => setTraces(d.traces ?? []))
      .finally(() => setLoading(false))
  }, [incidentId])

  const minConf = traces.length > 0 ? Math.min(...traces.map(t => t.confidence)) : 100
  const minConfColor = minConf < 70 ? '#E05252' : minConf < 90 ? '#E8A838' : '#4BF2A2'

  return (
    <section className="mb-4 rounded-lg border border-[#1A2035] bg-[#0D1525] p-4">
      <header className="flex items-center justify-between border-b border-[#1A2035] pb-3 mb-3">
        <div className="flex items-center gap-3">
          <span className="text-[11px] uppercase tracking-wider text-[#8892A6]">
            Reasoning Trace
          </span>
          <span className="text-[10px] text-[#5A6378]">v1 original classification</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-[#8892A6]">min confidence</span>
          <span className="font-mono text-[13px]" style={{ color: minConfColor }}>
            {minConf}%
          </span>
          {minConf < 70 && <span className="text-[#E05252]">⚠</span>}
        </div>
      </header>

      {loading && <div className="text-[12px] text-[#5A6378]">Loading trace…</div>}

      {!loading && traces.length === 0 && (
        <div className="text-[12px] text-[#5A6378]">No reasoning trace recorded for this incident.</div>
      )}

      {!loading && traces.map(t => (
        <StepRow
          key={t.step_name}
          trace={t}
          expanded={expandedStep === t.step_name}
          onToggle={() => setExpandedStep(expandedStep === t.step_name ? null : t.step_name)}
          incidentId={incidentId}
        />
      ))}

      <footer className="mt-3 pt-3 border-t border-[#1A2035] text-[10px] text-[#5A6378]">
        Reasoning is for the original classification, not the current proposal revision.
      </footer>
    </section>
  )
}
```

### 7.2 `StepRow.tsx`

**File:** `components/reasoning/StepRow.tsx` (new, client component)

Renders one collapsible step row. When expanded, shows `reasoning_text`, a "Deeper explanation" button that swaps in `narrative_text` on click, and a "Tag as wrong" button opening a pill picker.

```tsx
'use client'

import { useState } from 'react'
import type { ReasoningTrace } from '@/lib/types'

const STEP_LABELS: Record<string, string> = {
  matching: '1. Matching',
  is_incident: '2. Is incident',
  classification: '3. Classification',
  priority: '4. Priority',
  routing: '5. Routing',
  voice_fit: '6. Voice fit',
}

const TAG_MAP: Record<string, string> = {
  matching: 'wrong_matching',
  is_incident: 'wrong_classification',
  classification: 'wrong_classification',
  priority: 'wrong_priority',
  routing: 'wrong_routing',
  voice_fit: 'wrong_voice_fit',
}

interface StepRowProps {
  trace: ReasoningTrace
  expanded: boolean
  onToggle: () => void
  incidentId: string
}

export function StepRow({ trace, expanded, onToggle, incidentId }: StepRowProps) {
  const [narrative, setNarrative] = useState(trace.narrative_text ?? '')
  const [loadingNarrative, setLoadingNarrative] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)
  const [tagSubmitted, setTagSubmitted] = useState(false)

  const confColor = trace.confidence < 70 ? '#E05252' : trace.confidence < 90 ? '#E8A838' : '#4BF2A2'
  const lowConf = trace.confidence < 70

  async function fetchNarrative() {
    if (narrative) { setShowNarrative(!showNarrative); return }
    setLoadingNarrative(true)
    try {
      const r = await fetch(`/api/incidents/${incidentId}/reasoning/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: trace.step_name }),
      })
      const d = await r.json()
      if (d.narrative) {
        setNarrative(d.narrative)
        setShowNarrative(true)
      }
    } finally {
      setLoadingNarrative(false)
    }
  }

  async function submitWrongTag() {
    const tag = TAG_MAP[trace.step_name]
    await fetch(`/api/incidents/${incidentId}/reasoning/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tags: [tag] }),
    })
    setTagSubmitted(true)
  }

  return (
    <div className="border-b border-[#151E35] last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2.5 text-left hover:bg-[#0F1828] transition"
      >
        <div className="flex items-center gap-2">
          <span className="text-[#5A6378] text-[10px]">{expanded ? '▾' : '▸'}</span>
          <span className="text-[12px] text-[#D4DAEA]">{STEP_LABELS[trace.step_name]}</span>
          {lowConf && <span className="text-[#E05252]">⚠</span>}
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px]" style={{ color: confColor }}>
            {trace.confidence}%
          </span>
          <span className="font-mono text-[11px] text-[#8892A6]">{trace.decision}</span>
        </div>
      </button>

      {expanded && (
        <div className="pb-3 pl-5 pr-2">
          <div className="rounded border border-[#151E35] bg-[#080E1C] p-3">
            <p className="text-[12px] leading-relaxed text-[#B0B8CC]">
              {showNarrative && narrative ? narrative : trace.reasoning_text}
            </p>
            <div className="mt-3 flex gap-2">
              <button
                onClick={fetchNarrative}
                disabled={loadingNarrative}
                className="text-[10px] uppercase tracking-wide text-[#F2784B] hover:text-[#FF8C5C] disabled:opacity-50"
              >
                {loadingNarrative ? 'Generating…' : showNarrative ? 'Hide narrative' : 'Deeper explanation'}
              </button>
              <button
                onClick={submitWrongTag}
                disabled={tagSubmitted}
                className="text-[10px] uppercase tracking-wide text-[#8892A6] hover:text-[#E05252] disabled:opacity-50"
              >
                {tagSubmitted ? '✓ tagged' : 'Tag as wrong'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

### 7.3 `/reasoning` page

**File:** `app/(dashboard)/reasoning/page.tsx` (new, server component with client islands)

```tsx
import { ReasoningStats } from '@/components/reasoning/ReasoningStats'
import { CalibrationChart } from '@/components/reasoning/CalibrationChart'
import { TraceLog } from '@/components/reasoning/TraceLog'

export default async function ReasoningPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-[24px] font-semibold text-[#E6EAF4]">Reasoning</h1>
        <p className="text-[12px] text-[#8892A6] mt-1">
          Every AI decision, step by step. Filter by step, confidence, category, or cluster.
        </p>
      </header>

      <ReasoningStats />
      <CalibrationChart />
      <TraceLog />
    </div>
  )
}
```

**Child components:**

- `components/reasoning/ReasoningStats.tsx` — 4 stat cards (total / high conf / low conf / avg). Fetches `/api/reasoning/stats`.
- `components/reasoning/CalibrationChart.tsx` — Table: category × step, each cell shows stated / actual / gap. Red text when gap > 15. Fetches `/api/reasoning/calibration`.
- `components/reasoning/TraceLog.tsx` — Filterable log feed with pill filters (step, band, category, cluster). Each row links to `/command?incident=${id}&expandStep=${step_name}`. Fetches `/api/reasoning?...`.
- `components/reasoning/ConfidenceFilter.tsx` — pill filter widget, reusable.

### 7.4 Sidebar + Command Center integration

**`components/layout/Sidebar.tsx`** — add reasoning entry after learning:

```typescript
// NAV_ITEMS (around line 22-23)
{ href: '/learning', icon: GraduationCap, label: 'Learning' },
{ href: '/reasoning', icon: Lightbulb, label: 'Reasoning', showRedDot: true }, // NEW
{ href: '/settings', icon: Wrench, label: 'Settings' },
```

Add a `showRedDot` prop that queries `/api/reasoning/stats` and renders a small red dot overlay if `low > 0`.

**`components/command/CommandCenter.tsx`** — in the incident list row render, add red dot:

```tsx
{/* Inside incident row */}
<div className="flex items-center gap-2">
  {incident.min_reasoning_confidence !== null && incident.min_reasoning_confidence < 70 && (
    <span
      className="w-1.5 h-1.5 rounded-full bg-[#E05252]"
      title="Low reasoning confidence — one or more steps below 70%"
    />
  )}
  <span className="text-[13px] text-[#D4DAEA]">{incident.title}</span>
</div>
```

The list query in `getIncidents` already returns all incident fields via `select('*')` — no backend change needed.

---

## 8. Integration Points

### 8.1 `lib/incidents.ts` — `createIncident`

**Before dedup check (line 133):** call `findMatchingIncident`. If `decision === 'merge'`, append to existing incident's timeline and return the merged incident instead of creating new:

```typescript
export async function createIncident(data: {...}, matchResult: MatchResult): Promise<Incident | null> {
  try {
    // NEW: handle merge decision
    if (matchResult.decision === 'merge' && matchResult.target_id) {
      const { data: target } = await supabaseAdmin
        .from('incidents')
        .select('*')
        .eq('id', matchResult.target_id)
        .single()

      if (target) {
        // Append to existing timeline
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
            merge_count: (target.merge_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', target.id)

        // Write matching trace row on the TARGET incident
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
    }

    // Existing dedup + create path below (unchanged except `assigned_to` is now passed in)
    ...
  }
}
```

### 8.2 `lib/incidents.ts` — `analyseIncident`

**After classification returns**, write all 6 trace rows + persist `assigned_to`:

```typescript
export async function analyseIncident(incidentId: string): Promise<Incident | null> {
  const { data: incident } = await supabaseAdmin.from('incidents').select('*').eq('id', incidentId).single()
  if (!incident) return null

  // Load message context (already in raw_content, source, etc.)
  const classifyResult = await classifyMessage(
    incident.raw_content,
    incident.source,
    incident.group_name,
    { cluster: incident.cluster, lark_root_id: incident.lark_root_id, sender_open_id: incident.sender_open_id }
  )

  // Persist structured routing
  await supabaseAdmin.from('incidents').update({
    assigned_to: classifyResult.assigned_to,
  }).eq('id', incidentId)

  // Write all 6 trace rows (batch)
  if (classifyResult.reasoning_steps.length === 6) {
    const { writeFullTrace } = await import('./reasoning/trace-writer')
    await writeFullTrace(
      classifyResult.reasoning_steps.map(step => ({
        ...step,
        incident_id: incidentId,
        model_version: step.generated_by === 'llm' ? 'claude-sonnet-4-6' : undefined,
      }))
    )
  }

  // Existing proposeAction flow
  const { proposal, reasoning, confidence, pastFeedbackInjected } = await proposeAction(...)

  // Voice fit: use AI step result if available, fall back to old rule
  const voiceFitDelegate = classifyResult.voice_fit === 'delegate' && classifyResult.reasoning_steps.length === 6
  const newStatus = voiceFitDelegate && incident.priority !== 'P1' ? 'acting' : 'awaiting_lee'
  // OLD: const newStatus = confidence >= 95 && incident.priority !== 'P1' ? 'acting' : 'awaiting_lee'

  // ... rest unchanged
}
```

### 8.3 `lib/incidents.ts` — `proposeAction`

**Inject `assigned_to` into the proposal prompt** so `proposeAction` uses the structured PIC instead of picking one itself:

```typescript
// In proposeAction, around line 100
const picInstruction = incident.assigned_to
  ? `ASSIGNED PIC (use this name verbatim, do not substitute): ${incident.assigned_to}`
  : ''

const system = `You are Lee Seng Hee's ${incident.agent.toUpperCase()} twin. ...
${picInstruction}
...`
```

### 8.4 Reasoning rules injection into classify prompt

Swap the stub in `classifyMessage` for the real loader. Since the category isn't known before classification runs, we pass the *detected* category back in for the next incident — i.e., the learned rules injection happens on the **next** incident in the same category, not the current one. This is a known limitation but aligns with how `proposeAction` already works (looks up past rules by category before generating).

For the *initial* classification rule injection, we use a simpler heuristic: load the **cluster-level** reasoning rules (which are known before classification). Extend `getCategoryReasoningRulesForPrompt` to accept a `cluster` parameter and return cluster-scoped rules when category is unknown.

### 8.5 Webhook → `createIncident` signature change

The Lark webhook handler (`app/api/events/lark/route.ts` or similar) currently calls `createIncident(data)`. It now needs to:

1. Build the `MessageContext` (cluster, lark_root_id, sender_open_id)
2. Call `classifyMessage(content, source, groupContext, context)` which returns a `ClassifyResult` including `match_result`
3. Call `createIncident(data, matchResult)` with the match result
4. If a new incident was created, call `analyseIncident(incident.id)` — but `analyseIncident` now re-runs `classifyMessage` inside it. **To avoid double-classification, refactor so the webhook does classification once and passes the full `ClassifyResult` into `analyseIncident`.**

**Refactor:** `analyseIncident(incidentId, classifyResult?)` — if `classifyResult` provided, skip the classification call and use it directly. Otherwise run classification (for backwards compat / manual re-analysis).

---

## 9. Types

```typescript
// lib/types.ts — ADD these

export type ReasoningStepName =
  | 'matching'
  | 'is_incident'
  | 'classification'
  | 'priority'
  | 'routing'
  | 'voice_fit'

export interface ReasoningTrace {
  id: string
  incident_id: string
  step_name: ReasoningStepName
  step_order: number
  decision: string
  decision_detail: Record<string, unknown>
  confidence: number
  reasoning_text: string
  narrative_text: string | null
  narrative_generated_at: string | null
  model_version: string | null
  generated_by: 'deterministic' | 'llm'
  input_signal: Record<string, unknown>
  created_at: string
}

export const REASONING_FEEDBACK_TAGS = [
  'wrong_matching',
  'wrong_classification',
  'wrong_priority',
  'wrong_routing',
  'wrong_voice_fit',
] as const

export type ReasoningFeedbackTag = typeof REASONING_FEEDBACK_TAGS[number]

// EXTEND existing Incident interface:
export interface Incident {
  // ... existing fields
  assigned_to: string | null
  min_reasoning_confidence: number | null
  merged_from_incident_id: string | null
  merge_count: number
}

// Extend ProposalRevision:
export interface ProposalRevision {
  // ... existing fields
  reasoning_feedback_tags: ReasoningFeedbackTag[]
}

// MatchResult re-exported from matching module
export type { MatchResult } from '@/lib/matching/incident-matcher'
```

---

## 10. Files to Create

```
supabase/migrations/
└── 20260411000000_reasoning_trace_and_routing.sql

lib/matching/
└── incident-matcher.ts

lib/reasoning/
├── prompt-builder.ts
├── trace-writer.ts
└── narrative-generator.ts

lib/learning/
└── reasoning-feedback.ts                — getCategoryReasoningRulesForPrompt

app/api/incidents/[id]/reasoning/
├── route.ts                              — GET trace
├── narrative/route.ts                    — POST narrative
└── feedback/route.ts                     — POST reasoning feedback tags

app/api/reasoning/
├── route.ts                              — GET log feed
├── calibration/route.ts                  — GET calibration
└── stats/route.ts                        — GET stats

app/(dashboard)/reasoning/
└── page.tsx

components/command/
└── ReasoningPanel.tsx

components/reasoning/
├── StepRow.tsx
├── ReasoningStats.tsx
├── CalibrationChart.tsx
├── TraceLog.tsx
└── ConfidenceFilter.tsx
```

## 11. Files to Modify

| File | Change |
|---|---|
| `lib/types.ts` | Add `ReasoningStepName`, `ReasoningTrace`, `ReasoningFeedbackTag`, extend `Incident` + `ProposalRevision` |
| `lib/incidents.ts` (lines 17-78) | Rewrite `classifyMessage` to call matcher, build reasoning prompt, return 6 steps. New signature includes `context` param. |
| `lib/incidents.ts` (lines 126-180) | Modify `createIncident` to accept `matchResult`, handle merge path, write matching trace |
| `lib/incidents.ts` (lines 182-229) | Modify `analyseIncident` to accept optional pre-computed `ClassifyResult`, write all 6 trace rows, use `voice_fit` step for status gate, persist `assigned_to` |
| `lib/incidents.ts` (`proposeAction`) | Inject `assigned_to` into system prompt so PIC is used verbatim |
| `lib/learning/revision-manager.ts` | Add `submitReasoningFeedback(incidentId, tags)` |
| `app/api/events/lark/route.ts` (or wherever webhook lives) | Build context object, call classify once, pass result through to `createIncident` + `analyseIncident` |
| `components/command/IncidentDetail.tsx` | Import and render `<ReasoningPanel incidentId={id}/>` above existing `<ProposalRevisionPanel>` |
| `components/command/CommandCenter.tsx` | Add red dot span for `incident.min_reasoning_confidence < 70` in row render |
| `components/layout/Sidebar.tsx` (lines 9-24) | Add `/reasoning` entry after `/learning` with `Lightbulb` icon + `showRedDot` prop |
| `components/layout/Sidebar.tsx` (around lines 34-46) | Add low-confidence count fetch for the red dot overlay |

---

## 12. Testing Plan

### 12.1 Migration sanity

1. `supabase db reset` — migration applies cleanly on top of `20260410000000_proposal_learning_engine.sql`
2. Verify `incident_reasoning_traces` table exists with all columns + indexes
3. Verify `incidents.min_reasoning_confidence` + `incidents.assigned_to` columns added
4. Verify `routing_pics` table seeded with 5 PIC rows
5. Verify `proposal_revisions.reasoning_feedback_tags` column exists with default `{}`
6. Verify trigger `trg_recompute_min_conf` is active

### 12.2 Matcher unit test (regression lock)

Create a test fixture reproducing the bad thread merge bug:
- Existing incident: "Owner chasing 50% occupancy" in C10, thread_keywords includes `['b-15-06', 'occupancy', 'owner']`
- New message: maintenance list text mentioning `B-15-06` in passing, but keyword overlap with target < 40%

Call `findMatchingIncident` with the new message context. **Assert:** `decision === 'new'` (NOT merge), `signal === 'unit_cluster'`, `confidence === 55` (weak signal, below threshold).

This is the regression lock for the bug that motivated the feature. If it fails, matcher is over-eager and the spec is wrong.

### 12.3 Matcher — positive merge cases

1. **Root ID cascade:** Two messages with same `lark_root_id`. Second should merge into first. Confidence 95.
2. **Ticket ID cascade:** Message with `BLV-RQ-26005216`, existing incident with same ticket in `thread_keywords`. Should merge. Confidence 92.
3. **Unit + cluster + high overlap:** Same unit, same cluster, overlap >= 40%. Should merge. Confidence 75-90.

### 12.4 End-to-end classification

1. Post a real Lark webhook payload through `app/api/events/lark/route.ts`
2. Verify:
   - Incident created in `incidents` table
   - `incidents.assigned_to` populated with one of {Fatihah, Fariha, Adam, Linda, David}
   - 6 rows in `incident_reasoning_traces` for the new incident
   - `incidents.min_reasoning_confidence` matches the minimum trace row confidence
   - `matching` step has `generated_by = 'deterministic'`
   - Other 5 steps have `generated_by = 'llm'` and `model_version = 'claude-sonnet-4-6'`
3. Verify `proposal_revisions` has v1 as usual (Learning Engine still wired)
4. Verify `proposeAction` used `assigned_to` verbatim in the proposal text

### 12.5 Low-confidence flag UI

1. Manually `UPDATE incident_reasoning_traces SET confidence = 45 WHERE step_name = 'matching' AND incident_id = 'X'`
2. Verify trigger recomputed `incidents.min_reasoning_confidence = 45`
3. Open `/command` — verify red dot appears before the incident title
4. Check sidebar — verify reasoning entry has red dot overlay
5. Open incident detail — verify `ReasoningPanel` header shows "min confidence 45% ⚠"
6. Verify matching step row has warning icon

### 12.6 Narrative on-demand

1. Open incident detail, expand matching step
2. Click "Deeper explanation" — verify spinner appears
3. Verify a second Claude call fires (check network / logs)
4. Verify `narrative_text` + `narrative_generated_at` populated in DB
5. Click again — verify it toggles show/hide WITHOUT re-fetching
6. Refresh page — verify narrative is still cached (not regenerated)

### 12.7 Reasoning feedback tagging

1. Expand a step, click "Tag as wrong"
2. Verify `POST /api/incidents/[id]/reasoning/feedback` fires
3. Verify `proposal_revisions.reasoning_feedback_tags` on the current active revision contains the new tag
4. Verify `feedback_tags` (proposal-level) is untouched
5. Create 3+ more incidents in the same category with the same tag
6. Classify a new incident in the same category — verify `getCategoryReasoningRulesForPrompt` returns the rule and it's injected into the prompt (inspect the built prompt string)

### 12.8 `/reasoning` page

1. Navigate to `/reasoning`
2. Verify stat cards show correct totals (total, high conf, low conf, avg)
3. Verify calibration table renders with at least one (step, category) row showing stated / actual / gap
4. Verify trace log shows worst-confidence rows first
5. Filter by step — verify only matching rows appear
6. Filter by band "low" — verify all rows have confidence < 70
7. Filter by cluster — verify only that cluster's rows
8. Click a row — verify navigation to `/command?incident=<id>&expandStep=<step>`
9. Verify `ReasoningPanel` on that incident opens with the target step pre-expanded

### 12.9 Merge path integration

1. Create incident A in C10 with unit B-15-06 and `lark_root_id = 'xyz'`
2. Post another message to webhook with same `lark_root_id` AND different content
3. Verify NO new incident created
4. Verify incident A's `merge_count` incremented to 1
5. Verify incident A's timeline now has 2 entries
6. Verify a matching trace row was written to incident A with `decision = 'merge'`, confidence 95

### 12.10 Fallback paths

1. Force the LLM call to throw (disconnect network or mock) — verify `buildFallbackClassifyResult` returns sensible defaults
2. Verify `voice_fit` in fallback mode uses the old `confidence >= 95 && priority !== 'P1'` formula — no regression from pre-feature behavior
3. Verify no reasoning trace rows written on fallback (so incident has `min_reasoning_confidence = null`, not 0) — fallback is honest about not having reasoning data

### 12.11 Token cost measurement

1. Capture `usage` tokens from 10 real classifications before deploying this change (baseline)
2. After deploying, capture 10 more and compute:
   - Baseline avg input + output
   - New avg input + output
   - Delta per classification
3. Document in a comment in `lib/incidents.ts` above `classifyMessage` for future reference
4. If cost delta > 4x, raise a flag to Lee — consider dropping reasoning_text from prompt and generating on-demand only

---

## 13. Done Criteria

- [ ] Migration `20260411000000_reasoning_trace_and_routing.sql` applies cleanly
- [ ] `incident_reasoning_traces` table + indexes + trigger in place
- [ ] `incidents.min_reasoning_confidence`, `incidents.assigned_to`, `incidents.merged_from_incident_id`, `incidents.merge_count` columns added
- [ ] `proposal_revisions.reasoning_feedback_tags` column added
- [ ] `routing_pics` table seeded with 5 PICs
- [ ] `lib/types.ts` exports `ReasoningStepName`, `ReasoningTrace`, `ReasoningFeedbackTag` and extends `Incident` / `ProposalRevision`
- [ ] `lib/matching/incident-matcher.ts` exports `findMatchingIncident` with full signal cascade
- [ ] Matcher regression test passes: bad-thread-merge scenario returns `decision: 'new'`
- [ ] `lib/reasoning/prompt-builder.ts` builds expanded classification prompt
- [ ] `lib/reasoning/trace-writer.ts` exports `writeTrace` and `writeFullTrace`
- [ ] `lib/reasoning/narrative-generator.ts` exports `generateNarrative` with cache hit logic
- [ ] `lib/learning/reasoning-feedback.ts` exports `getCategoryReasoningRulesForPrompt`
- [ ] `lib/learning/revision-manager.ts` exports `submitReasoningFeedback`
- [ ] `classifyMessage` rewritten: accepts `context` param, calls matcher, raises `max_tokens` to 1000, returns 6-step trace
- [ ] `createIncident` handles merge path + writes matching trace on target
- [ ] `analyseIncident` writes all 6 trace rows, persists `assigned_to`, uses `voice_fit` step for status gate
- [ ] `proposeAction` reads `assigned_to` and uses verbatim
- [ ] `/api/incidents/[id]/reasoning` GET returns trace
- [ ] `/api/incidents/[id]/reasoning/narrative` POST generates + caches narrative
- [ ] `/api/incidents/[id]/reasoning/feedback` POST writes reasoning tags
- [ ] `/api/reasoning` GET returns filtered trace log
- [ ] `/api/reasoning/calibration` GET returns per-step per-category gap data
- [ ] `/api/reasoning/stats` GET returns summary stats
- [ ] `app/(dashboard)/reasoning/page.tsx` renders with all three sections
- [ ] `ReasoningPanel.tsx` renders above `ProposalRevisionPanel` in `IncidentDetail.tsx`
- [ ] `StepRow.tsx` supports expand, narrative fetch, and tag-as-wrong
- [ ] `CommandCenter.tsx` renders red dot on low-confidence incidents
- [ ] `Sidebar.tsx` has `/reasoning` entry after `/learning` with `Lightbulb` icon and red dot overlay
- [ ] Lark webhook refactored to classify once and pass result through (no double classification)
- [ ] Voice fit fallback to old formula works on LLM failure
- [ ] `tsc --noEmit` passes
- [ ] Token cost measured + documented
- [ ] All 11 testing subsections pass manually
- [ ] QC prompts in `NUCLEUS-REASONING-TRACE-QC-PROMPTS.md` pass on a fresh Claude Code session
- [ ] Committed to `dev` and `main`
- [ ] Watchdog logs reasoning trace events (new event type: `REASONING_TRACE_WRITTEN`)

---

## 14. Claude Code Prompt

```
Read CLAUDE.md and AGENTS.md. AGENTS.md says the Next.js version has breaking changes — before writing any code, read the relevant guide in node_modules/next/dist/docs/. Then read docs/features/NUCLEUS-PROPOSAL-LEARNING-ENGINE-SPEC.md to understand the format + the already-built Learning Engine you'll integrate with. Then read docs/features/NUCLEUS-REASONING-TRACE-SPEC.md completely. Then load all skills listed in CLAUDE.md.

Build everything in the spec from section 4 (Schema) through section 13 (Done Criteria) in exactly this order — complete each step fully and run `tsc --noEmit` before moving to the next:

1. Migration file 20260411000000_reasoning_trace_and_routing.sql — create incident_reasoning_traces table, add columns to incidents, add reasoning_feedback_tags to proposal_revisions, seed routing_pics table, install trigger.
2. lib/types.ts additions — ReasoningStepName, ReasoningTrace, ReasoningFeedbackTag, extend Incident and ProposalRevision.
3. lib/matching/incident-matcher.ts — findMatchingIncident with full 3-signal cascade. Write a standalone test fixture reproducing the bad-thread-merge bug and verify it returns decision: 'new' before proceeding.
4. lib/reasoning/prompt-builder.ts — buildReasoningClassificationPrompt.
5. lib/reasoning/trace-writer.ts — writeTrace + writeFullTrace.
6. lib/reasoning/narrative-generator.ts — generateNarrative with cache hit logic.
7. lib/learning/reasoning-feedback.ts — getCategoryReasoningRulesForPrompt.
8. lib/learning/revision-manager.ts — add submitReasoningFeedback.
9. Rewrite lib/incidents.ts: classifyMessage (new signature with context, calls matcher, returns 6-step trace), createIncident (handle merge path), analyseIncident (write all 6 traces, use voice_fit step for gate, persist assigned_to), proposeAction (inject assigned_to into prompt).
10. Refactor the Lark webhook handler so classification runs exactly ONCE and the result flows through createIncident + analyseIncident.
11. API routes in this order: /api/incidents/[id]/reasoning (GET), /narrative (POST), /feedback (POST), then /api/reasoning (GET), /calibration (GET), /stats (GET).
12. components/command/ReasoningPanel.tsx + components/reasoning/StepRow.tsx.
13. Integrate ReasoningPanel into components/command/IncidentDetail.tsx above ProposalRevisionPanel.
14. Add red dot to components/command/CommandCenter.tsx row render.
15. Add /reasoning entry to components/layout/Sidebar.tsx after /learning with Lightbulb icon and showRedDot prop.
16. app/(dashboard)/reasoning/page.tsx + child components ReasoningStats, CalibrationChart, TraceLog, ConfidenceFilter.
17. Run tsc --noEmit one final time, then run through section 12 Testing Plan manually.
18. Commit to dev branch with message "feat(reasoning): per-step reasoning trace + real matcher + routing AI + voice_fit AI".

CRITICAL CONSTRAINTS:
- This spec bundles a backend behavior change (real matcher, structured routing, voice_fit AI) with an observability feature (reasoning trace). Do not treat any of the backend changes as optional — the reasoning trace has nothing to observe without them.
- The matcher MUST be conservative: when signals are weak, default to decision 'new'. Over-eager merging corrupts incident timelines and is worse than the current behavior.
- The voice_fit step MUST fall back to the old hardcoded rule on LLM failure. Never regress autonomy behavior.
- Classification must run exactly ONCE per incoming message. The current code path has analyseIncident calling classifyMessage; the new path has the webhook calling it and passing the result through. Do not leave both paths active.
- The assigned_to field must be the single source of truth for PIC. proposeAction must read it and use the name verbatim — it should not pick a PIC itself.
- Token cost will ~3x. Measure before and after on 10 real classifications and document the delta in a comment above classifyMessage.
```

---

*Confidential — BeLive Property Hub / Spacify Technologies*
