# BeLive Nucleus — Proposal Learning Engine Spec

**Feature:** Revision tracking, structured feedback loop, /learning analytics, per-category autonomy gate
**Version:** 1.0
**Date:** 10 April 2026
**Author:** Lee Seng Hee
**Status:** Ready to build

---

## 1. Philosophy

Nucleus currently proposes → Lee approves or overwrites → done. That's a one-bit signal (yes/no). The system never learns *why* it was wrong, *what* Lee changed, or *how* the next proposal should differ.

This feature turns every decision into a **labeled training example**. When Lee tags a proposal as "wrong person" and writes "don't tag Adam for owner issues — that's Linda's scope," that's a correction with a reason. When AI regenerates and Lee approves v2, the system now has: original → feedback → correction → approval. Over time, these accumulate into:

1. **Correction patterns** — "Lee adds deadlines 34x" → the AI prompt should always include deadlines
2. **Per-category accuracy** — "Maintenance 91%, Owner relations 43%" → trust maintenance, not owner relations
3. **Convergence proof** — a 30-day trend showing acceptance rate climbing = the system is learning

This is the foundation for the 95% autonomy gate. Without it, "95% confidence" is a made-up number. With it, 95% means "Lee approved 95 of the last 100 proposals in this category without editing."

**Core principle: the revision chain is not a log — it's a training dataset.**

---

## 2. Confirmed Decisions

| Decision | Choice | Notes |
|----------|--------|-------|
| Regeneration trigger | Manual "Regenerate" button | Lee can stack multiple comments before triggering |
| Feedback format | Free text + quick tags | Tags: Wrong person, Wrong tone, Missing deadline, Missing context, Too aggressive, Too soft |
| Revision visibility | Collapsible accordion on incident detail page | v1, v2, v3... with feedback blocks |
| Analytics page | New sidebar page: /learning | Full analytics: stats, patterns, categories, trends, log |
| Auto-lock | On send — sent version = final, chain closed | No post-send editing |
| Feedback → prompts | Phase 1: YES — inject past feedback for same category | Top corrections become prompt rules |
| Autonomy gate | Per-category, not global | Maintenance can auto-send while owner relations stays manual |
| Autonomy threshold | 95% acceptance over last 20 proposals per category | Configurable per category |
| Quick tags | Extensible — stored as string array, not enum | Lee can define custom tags later |

---

## 3. User Flow — Incident Detail Page

### 3.1 The revision cycle

```
Lee opens incident → sees PROPOSED ACTION (v1) + confidence

Option A: Approve immediately
  → Lee clicks [Approve & Send]
  → v1 becomes final, chain locked, status → "acting"
  → Logged as: approved, version=1, revisions=0, tags=[]

Option B: Give feedback + regenerate
  → Lee taps quick tags: [Wrong person] [Missing deadline]
  → Lee types: "Don't tag Adam for owner issues — that's Linda. Add 3pm deadline."
  → Lee clicks [Regenerate]
  → AI reads: original context + v1 proposal + Lee's feedback (tags + text) + past category corrections
  → AI generates v2
  → v1 collapses into accordion with feedback block attached
  → v2 becomes the active proposal
  → Lee can repeat (tag + comment + regenerate → v3, v4...)
  → When satisfied, Lee clicks [Approve & Send]
  → vN becomes final, chain locked

Option C: Discard
  → Lee clicks discard (trash icon)
  → Logged as: discarded, version=N, revisions=N-1, tags accumulated
  → Resets autonomy consecutive count for this category
```

### 3.2 Visual layout (enhanced right panel)

```
┌─────────────────────────────────────────────┐
│  PROPOSED ACTION                    v3 of 3 │
│                                         88% │
├─────────────────────────────────────────────┤
│                                             │
│  [Current proposal text - v3]               │
│  Linda — take point on this...              │
│                                             │
├─────────────────────────────────────────────┤
│  ✓ v3 approved │ 2 revisions │ Tags: ...   │
├─────────────────────────────────────────────┤
│  ▼ v1 — AI original              12:46 pm  │
│  ─────────────────────────────────────────  │
│  ▼ v2 — revised    [Wrong person] 12:52 pm │
│    ┌─ LEE'S FEEDBACK ─────────────────────┐ │
│    │ Don't tag Adam for owner issues...   │ │
│    │ [Wrong person] [Missing deadline]    │ │
│    └──────────────────────────────────────┘ │
│  ─────────────────────────────────────────  │
│  ▲ v3 — final (sent) ✓           12:55 pm │
├─────────────────────────────────────────────┤
│  YOUR FEEDBACK                              │
│  [Wrong person] [Wrong tone]                │
│  [Missing deadline] [Missing context]       │
│  [Too aggressive] [Too soft]                │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │ Type your feedback on this proposal  │   │
│  └──────────────────────────────────────┘   │
│                                             │
│  [ ✕ Regenerate ]                           │
├─────────────────────────────────────────────┤
│  [Approve & Send]  [Send Custom]  [Test]    │
└─────────────────────────────────────────────┘
```

### 3.3 Quick tags

Initial set (stored as string[], extensible):

| Tag | Color | Meaning |
|-----|-------|---------|
| Wrong person | Amber | AI tagged/assigned the wrong staff member |
| Wrong tone | Purple | Tone doesn't match the situation (too formal/informal) |
| Missing deadline | Blue | No specific time/date given for follow-up |
| Missing context | Teal | AI missed important background info |
| Too aggressive | Red | Tone too harsh for the situation |
| Too soft | Gray | Should be firmer, more direct |

Tags are **toggle pills** — tap to select (highlighted border + filled), tap again to deselect. Multiple tags can be selected simultaneously. Tags are stored per-revision as `string[]`.

---

## 4. Database

### 4.1 New table: `proposal_revisions`

Stores every version of every proposal, including feedback.

```sql
-- Migration: YYYYMMDDHHMMSS_proposal_learning_engine.sql

-- Proposal revision chain
CREATE TABLE proposal_revisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,

  -- The proposal content
  proposal_text text NOT NULL,
  ai_confidence integer,  -- 0-100

  -- Lee's feedback (null for the final/approved version)
  feedback_text text,
  feedback_tags text[] DEFAULT '{}',

  -- State
  is_final boolean DEFAULT false,  -- true = this version was sent or discarded
  outcome text CHECK (outcome IN ('approved', 'edited', 'discarded', 'pending')),
    -- approved = sent as-is (v1, no edits)
    -- edited = sent after revisions (v2+)
    -- discarded = chain killed
    -- pending = not yet decided

  -- AI generation metadata
  ai_prompt_tokens integer,
  ai_completion_tokens integer,
  past_feedback_injected boolean DEFAULT false,  -- was category feedback injected into this prompt?

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz,  -- when approved/discarded

  -- Constraints
  UNIQUE(incident_id, version_number)
);

CREATE INDEX idx_proposal_revisions_incident ON proposal_revisions(incident_id);
CREATE INDEX idx_proposal_revisions_outcome ON proposal_revisions(outcome);
CREATE INDEX idx_proposal_revisions_created ON proposal_revisions(created_at DESC);

-- Per-category learning stats (materialized, recomputed on each decision)
CREATE TABLE category_learning_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL UNIQUE,

  -- Counts
  total_proposals integer DEFAULT 0,
  approved_v1 integer DEFAULT 0,      -- sent as-is, no revision
  approved_edited integer DEFAULT 0,   -- sent after revisions
  discarded integer DEFAULT 0,

  -- Computed rates
  acceptance_rate numeric(5,2) DEFAULT 0,  -- (approved_v1 / total) * 100
  edit_rate numeric(5,2) DEFAULT 0,        -- (approved_edited / total) * 100

  -- Autonomy tracking
  last_20_outcomes text[] DEFAULT '{}',  -- rolling window of last 20 outcomes: 'approved'|'edited'|'discarded'
  consecutive_approvals integer DEFAULT 0,  -- current streak of v1 approvals
  auto_send_eligible boolean DEFAULT false,
  auto_send_enabled boolean DEFAULT false,  -- Lee's manual toggle

  -- Top correction tags (computed)
  top_tags jsonb DEFAULT '[]',  -- [{"tag": "Missing deadline", "count": 34}, ...]

  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE proposal_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_learning_stats ENABLE ROW LEVEL SECURITY;

-- Service role access (Lee-only app)
CREATE POLICY "service_role_all" ON proposal_revisions FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON category_learning_stats FOR ALL
  USING (true) WITH CHECK (true);

-- Updated_at triggers
CREATE TRIGGER set_updated_at_category_learning_stats
  BEFORE UPDATE ON category_learning_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 4.2 Update existing `incidents` table

Add columns to link to the revision chain:

```sql
-- In the same migration file

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS current_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_revisions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposal_outcome text
    CHECK (proposal_outcome IN ('approved', 'edited', 'discarded', 'pending')),
  ADD COLUMN IF NOT EXISTS proposal_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_tags_accumulated text[] DEFAULT '{}';
```

---

## 5. Core Functions

### 5.1 Revision manager

```typescript
// lib/learning/revision-manager.ts

import { supabaseAdmin } from '@/lib/supabase-admin'
import type { ProposalRevision, RevisionFeedback } from '@/lib/types'

/**
 * Create the initial v1 proposal revision when AI generates a proposal.
 * Called from incidents.ts after AI classification + proposal generation.
 */
export async function createInitialRevision(
  incidentId: string,
  proposalText: string,
  confidence: number,
  tokenUsage?: { prompt: number; completion: number }
): Promise<ProposalRevision> {
  const { data, error } = await supabaseAdmin
    .from('proposal_revisions')
    .insert({
      incident_id: incidentId,
      version_number: 1,
      proposal_text: proposalText,
      ai_confidence: confidence,
      outcome: 'pending',
      ai_prompt_tokens: tokenUsage?.prompt,
      ai_completion_tokens: tokenUsage?.completion,
    })
    .select()
    .single()

  if (error) throw error
  return data
}

/**
 * Submit feedback on current version and generate the next revision.
 * Does NOT auto-regenerate — just stores feedback. Call regenerateProposal() separately.
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
      outcome: 'edited',  // this version was revised
    })
    .eq('incident_id', incidentId)
    .eq('version_number', currentVersion)

  if (error) throw error

  // Accumulate tags on the incident
  await supabaseAdmin.rpc('array_append_unique', {
    table_name: 'incidents',
    row_id: incidentId,
    column_name: 'feedback_tags_accumulated',
    new_values: feedback.tags,
  })
  // Fallback if RPC doesn't exist: direct update
}

/**
 * Generate next revision using AI, incorporating all feedback from the chain.
 */
export async function regenerateProposal(
  incidentId: string
): Promise<ProposalRevision> {
  // 1. Load full revision chain
  const { data: chain } = await supabaseAdmin
    .from('proposal_revisions')
    .select('*')
    .eq('incident_id', incidentId)
    .order('version_number', { ascending: true })

  if (!chain || chain.length === 0) throw new Error('No revision chain found')

  // 2. Load incident for context
  const { data: incident } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('id', incidentId)
    .single()

  if (!incident) throw new Error('Incident not found')

  // 3. Load past category feedback (for prompt injection)
  const categoryFeedback = await getCategoryFeedbackForPrompt(incident.category)

  // 4. Build the regeneration prompt
  const nextVersion = chain.length + 1
  const prompt = buildRegenerationPrompt(incident, chain, categoryFeedback)

  // 5. Call Claude
  const { text, confidence, usage } = await callClaudeForRegeneration(prompt)

  // 6. Store new revision
  const { data: newRevision, error } = await supabaseAdmin
    .from('proposal_revisions')
    .insert({
      incident_id: incidentId,
      version_number: nextVersion,
      proposal_text: text,
      ai_confidence: confidence,
      outcome: 'pending',
      ai_prompt_tokens: usage.prompt,
      ai_completion_tokens: usage.completion,
      past_feedback_injected: categoryFeedback.length > 0,
    })
    .select()
    .single()

  if (error) throw error

  // 7. Update incident
  await supabaseAdmin
    .from('incidents')
    .update({
      ai_proposal: text,
      ai_confidence: confidence,
      current_version: nextVersion,
      total_revisions: nextVersion - 1,
    })
    .eq('id', incidentId)

  return newRevision
}

/**
 * Finalize the chain — called when Lee approves/sends or discards.
 */
export async function finalizeRevisionChain(
  incidentId: string,
  outcome: 'approved' | 'edited' | 'discarded'
): Promise<void> {
  // Get current version
  const { data: incident } = await supabaseAdmin
    .from('incidents')
    .select('current_version, category')
    .eq('id', incidentId)
    .single()

  if (!incident) throw new Error('Incident not found')

  const now = new Date().toISOString()

  // Mark final version
  await supabaseAdmin
    .from('proposal_revisions')
    .update({
      is_final: true,
      outcome,
      decided_at: now,
    })
    .eq('incident_id', incidentId)
    .eq('version_number', incident.current_version)

  // Update incident
  await supabaseAdmin
    .from('incidents')
    .update({
      proposal_outcome: outcome,
      proposal_decided_at: now,
    })
    .eq('id', incidentId)

  // Recompute category stats
  await recomputeCategoryStats(incident.category)
}
```

### 5.2 AI regeneration prompt builder

```typescript
// lib/learning/prompt-builder.ts

import type { Incident, ProposalRevision, CategoryFeedbackRule } from '@/lib/types'

/**
 * Build the prompt for regenerating a proposal.
 * Includes: original context, full revision chain with feedback, category-level rules.
 */
export function buildRegenerationPrompt(
  incident: Incident,
  chain: ProposalRevision[],
  categoryRules: CategoryFeedbackRule[]
): string {
  const sections: string[] = []

  // Section 1: Category-level learned rules (from past feedback across ALL incidents in this category)
  if (categoryRules.length > 0) {
    sections.push(`<learned_rules>
Based on past corrections in the "${incident.category}" category, follow these rules:
${categoryRules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n')}
</learned_rules>`)
  }

  // Section 2: Incident context
  sections.push(`<incident>
Category: ${incident.category}
Cluster: ${incident.cluster}
Severity: ${incident.severity}
Priority: ${incident.priority}
Title: ${incident.title}
Original message context:
${incident.original_content || incident.title}
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

Return your response as JSON:
{
  "proposal": "the full response text",
  "confidence": 0-100,
  "changes_made": "brief note on what changed from previous version"
}
</instruction>`)

  return sections.join('\n\n')
}
```

### 5.3 Category feedback extraction

```typescript
// lib/learning/category-feedback.ts

import { supabaseAdmin } from '@/lib/supabase-admin'

export interface CategoryFeedbackRule {
  rule: string
  source_count: number  // how many times this correction appeared
  example_feedback: string  // one real example from Lee
}

/**
 * Extract the top correction patterns for a category.
 * Called during proposal generation to inject as prompt rules.
 *
 * Logic:
 * 1. Pull all feedback from proposal_revisions where incident.category matches
 * 2. Group by feedback_tags
 * 3. For each tag with count >= 3, extract a rule from the most common feedback_text
 * 4. Return top 5 rules sorted by count descending
 */
export async function getCategoryFeedbackForPrompt(
  category: string
): Promise<CategoryFeedbackRule[]> {
  // Query all feedback for this category (joins through incidents)
  const { data: feedbackRows } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      feedback_text,
      feedback_tags,
      incidents!inner (category)
    `)
    .eq('incidents.category', category)
    .not('feedback_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(200)  // last 200 feedback entries for this category

  if (!feedbackRows || feedbackRows.length === 0) return []

  // Count tags and collect example feedback
  const tagMap = new Map<string, { count: number; examples: string[] }>()

  for (const row of feedbackRows) {
    const tags = row.feedback_tags || []
    for (const tag of tags) {
      const existing = tagMap.get(tag) || { count: 0, examples: [] }
      existing.count++
      if (existing.examples.length < 3 && row.feedback_text) {
        existing.examples.push(row.feedback_text)
      }
      tagMap.set(tag, existing)
    }
  }

  // Filter to tags with 3+ occurrences, sort by count
  const rules: CategoryFeedbackRule[] = []
  const sorted = [...tagMap.entries()]
    .filter(([, v]) => v.count >= 3)
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 5)

  for (const [tag, data] of sorted) {
    // Build rule from tag + most common example
    const exampleText = data.examples[0] || ''
    const rule = buildRuleFromTagAndExample(tag, exampleText)
    rules.push({
      rule,
      source_count: data.count,
      example_feedback: exampleText,
    })
  }

  return rules
}

function buildRuleFromTagAndExample(tag: string, example: string): string {
  // Combine the tag type with the specific correction
  // e.g. tag="Wrong person", example="Don't tag Adam for owner issues — that's Linda"
  // → "Wrong person: Don't tag Adam for owner issues — that's Linda"
  if (example) return `${tag}: ${example}`
  return `Avoid: ${tag.toLowerCase()}`
}
```

### 5.4 Category stats recomputation

```typescript
// lib/learning/category-stats.ts

import { supabaseAdmin } from '@/lib/supabase-admin'

const ROLLING_WINDOW = 20  // last N proposals for autonomy calculation
const AUTONOMY_THRESHOLD = 0.95  // 95% approval rate

/**
 * Recompute stats for a single category after a decision.
 * Called from finalizeRevisionChain().
 */
export async function recomputeCategoryStats(category: string): Promise<void> {
  // 1. Count all proposals in this category
  const { data: allRevisions } = await supabaseAdmin
    .from('proposal_revisions')
    .select(`
      outcome,
      is_final,
      version_number,
      feedback_tags,
      incidents!inner (category)
    `)
    .eq('incidents.category', category)
    .eq('is_final', true)

  if (!allRevisions) return

  const total = allRevisions.length
  const approvedV1 = allRevisions.filter(
    r => r.outcome === 'approved' && r.version_number === 1
  ).length
  const approvedEdited = allRevisions.filter(
    r => r.outcome === 'edited' || (r.outcome === 'approved' && r.version_number > 1)
  ).length
  const discarded = allRevisions.filter(r => r.outcome === 'discarded').length

  const acceptanceRate = total > 0 ? (approvedV1 / total) * 100 : 0
  const editRate = total > 0 ? (approvedEdited / total) * 100 : 0

  // 2. Rolling window of last 20 outcomes
  const last20 = allRevisions
    .sort((a, b) => new Date(b.decided_at).getTime() - new Date(a.decided_at).getTime())
    .slice(0, ROLLING_WINDOW)
    .map(r => r.outcome === 'approved' && r.version_number === 1 ? 'approved' : r.outcome)

  // 3. Consecutive v1 approvals (current streak, breaks on any non-v1-approval)
  let consecutiveApprovals = 0
  for (const outcome of last20) {
    if (outcome === 'approved') consecutiveApprovals++
    else break
  }

  // 4. Auto-send eligibility: 95% of last 20 are v1 approvals
  const last20ApprovalRate = last20.length >= ROLLING_WINDOW
    ? last20.filter(o => o === 'approved').length / ROLLING_WINDOW
    : 0
  const autoSendEligible = last20ApprovalRate >= AUTONOMY_THRESHOLD

  // 5. Aggregate tag counts
  const tagCounts = new Map<string, number>()
  for (const rev of allRevisions) {
    // Also need non-final revisions for tag counting — query separately
  }
  // Re-query for ALL feedback tags (not just final versions)
  const { data: allFeedback } = await supabaseAdmin
    .from('proposal_revisions')
    .select('feedback_tags, incidents!inner (category)')
    .eq('incidents.category', category)
    .not('feedback_tags', 'eq', '{}')

  if (allFeedback) {
    for (const row of allFeedback) {
      for (const tag of (row.feedback_tags || [])) {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      }
    }
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }))

  // 6. Upsert stats
  await supabaseAdmin
    .from('category_learning_stats')
    .upsert({
      category,
      total_proposals: total,
      approved_v1: approvedV1,
      approved_edited: approvedEdited,
      discarded,
      acceptance_rate: Math.round(acceptanceRate * 100) / 100,
      edit_rate: Math.round(editRate * 100) / 100,
      last_20_outcomes: last20,
      consecutive_approvals: consecutiveApprovals,
      auto_send_eligible: autoSendEligible,
      top_tags: topTags,
    }, {
      onConflict: 'category',
    })
}
```

---

## 6. API Routes

### 6.1 Proposal revisions

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/incidents/[id]/revisions | Get full revision chain for an incident |
| POST | /api/incidents/[id]/revisions/feedback | Submit feedback (tags + text) on current version |
| POST | /api/incidents/[id]/revisions/regenerate | Generate next version (calls AI with full chain) |

```typescript
// app/api/incidents/[id]/revisions/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { data, error } = await supabaseAdmin
    .from('proposal_revisions')
    .select('*')
    .eq('incident_id', params.id)
    .order('version_number', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ revisions: data })
}
```

```typescript
// app/api/incidents/[id]/revisions/feedback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { submitFeedback } from '@/lib/learning/revision-manager'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const body = await req.json()
  const { version, tags, text } = body

  // Validate
  if (!version || typeof version !== 'number') {
    return NextResponse.json({ error: 'version required' }, { status: 400 })
  }
  if (!tags?.length && !text) {
    return NextResponse.json({ error: 'feedback required (tags or text)' }, { status: 400 })
  }

  try {
    await submitFeedback(params.id, version, { tags: tags || [], text: text || '' })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

```typescript
// app/api/incidents/[id]/revisions/regenerate/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { regenerateProposal } from '@/lib/learning/revision-manager'
import { logActivity } from '@/lib/activity-logger'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const revision = await regenerateProposal(params.id)

    await logActivity({
      event_type: 'AI_CLASSIFIED',
      summary: `Proposal regenerated to v${revision.version_number}`,
      detail: { incident_id: params.id, version: revision.version_number },
    })

    return NextResponse.json({ revision })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
```

### 6.2 Learning analytics

| Method | Endpoint | Purpose |
|--------|----------|---------|
| GET | /api/learning/stats | Global stats (totals, rates) |
| GET | /api/learning/categories | Per-category stats + autonomy status |
| GET | /api/learning/patterns | Top correction patterns across all categories |
| GET | /api/learning/trend | Daily acceptance rate for last 30 days |
| GET | /api/learning/log | Revision log feed (paginated, filterable) |
| PATCH | /api/learning/categories/[category]/autonomy | Toggle auto-send for a category |

```typescript
// app/api/learning/stats/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('category_learning_stats')
    .select('*')

  if (!data) return NextResponse.json({ error: 'No data' }, { status: 500 })

  const totals = data.reduce((acc, cat) => ({
    total: acc.total + cat.total_proposals,
    approvedV1: acc.approvedV1 + cat.approved_v1,
    approvedEdited: acc.approvedEdited + cat.approved_edited,
    discarded: acc.discarded + cat.discarded,
  }), { total: 0, approvedV1: 0, approvedEdited: 0, discarded: 0 })

  return NextResponse.json({
    ...totals,
    acceptanceRate: totals.total > 0
      ? Math.round((totals.approvedV1 / totals.total) * 1000) / 10
      : 0,
    editRate: totals.total > 0
      ? Math.round((totals.approvedEdited / totals.total) * 1000) / 10
      : 0,
    discardRate: totals.total > 0
      ? Math.round((totals.discarded / totals.total) * 1000) / 10
      : 0,
  })
}
```

```typescript
// app/api/learning/trend/route.ts

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  // Last 30 days, grouped by day
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabaseAdmin
    .from('proposal_revisions')
    .select('outcome, version_number, decided_at')
    .eq('is_final', true)
    .gte('decided_at', thirtyDaysAgo)
    .order('decided_at', { ascending: true })

  if (!data) return NextResponse.json({ trend: [] })

  // Group by day
  const dayMap = new Map<string, { total: number; approved: number }>()
  for (const row of data) {
    const day = row.decided_at?.split('T')[0]
    if (!day) continue
    const existing = dayMap.get(day) || { total: 0, approved: 0 }
    existing.total++
    if (row.outcome === 'approved' && row.version_number === 1) existing.approved++
    dayMap.set(day, existing)
  }

  const trend = [...dayMap.entries()].map(([date, { total, approved }]) => ({
    date,
    total,
    approved,
    rate: total > 0 ? Math.round((approved / total) * 100) : 0,
  }))

  return NextResponse.json({ trend })
}
```

```typescript
// app/api/learning/categories/[category]/autonomy/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { logActivity } from '@/lib/activity-logger'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { category: string } }
) {
  const { enabled } = await req.json()

  const { error } = await supabaseAdmin
    .from('category_learning_stats')
    .update({ auto_send_enabled: enabled })
    .eq('category', params.category)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity({
    event_type: 'LEE_ACTION',
    summary: `Auto-send ${enabled ? 'enabled' : 'disabled'} for category: ${params.category}`,
    detail: { category: params.category, auto_send_enabled: enabled },
  })

  return NextResponse.json({ success: true })
}
```

---

## 7. UI Components

### 7.1 Enhanced incident detail — right panel

**File:** `components/command/ProposalRevisionPanel.tsx` (new, client component)

Replaces the current static "PROPOSED ACTION" section. Contains:

1. **Header bar** — "PROPOSED ACTION" label + "v3 of 3" badge + confidence %
2. **Active proposal text** — the current version, same style as today
3. **Status pills** — "v3 approved" (green) / "2 revisions" / "Tags: Wrong person, Missing deadline"
4. **Revision accordion** — collapsible list of all versions
   - Each row: chevron + "v1 — AI original" / "v2 — revised [Wrong person]" + timestamp
   - Expanded row shows the proposal text + feedback block (if feedback exists)
   - Feedback block: left amber border, "LEE'S FEEDBACK" label, text, tag pills
   - Final version: green label "v3 — final (sent)" + checkmark
5. **Feedback input zone** — quick tag pills + textarea + [Regenerate] button
   - Tags are toggle pills: unselected = `#151E35` bg, `#8892A6` text, `0.5px #2A3550` border. Selected = `#2A1A1A` bg, tag-specific color text, matching border
   - Textarea: dark input field matching existing "Send as Lee" box
   - Regenerate button: outline style with coral text, icon ✕ (regenerate/refresh)
6. **Action buttons** — same as today: [Approve & Send] [Send Custom] [Test], but:
   - Approve & Send calls `finalizeRevisionChain()` then sends
   - Discard calls `finalizeRevisionChain('discarded')`

**State management:**
- `revisions[]` loaded from `/api/incidents/[id]/revisions`
- `selectedTags: string[]` — local state for current feedback
- `feedbackText: string` — local state for textarea
- `isRegenerating: boolean` — loading state during AI call
- Accordion open/close state per version

### 7.2 Learning page

**File:** `app/(dashboard)/learning/page.tsx` (new, server component with client islands)

**Layout:**

```
┌──────────────────────────────────────────────────────┐
│  /learning                                           │
├──────────────────────────────────────────────────────┤
│                                                      │
│  [ 847 Total ] [ 612 Sent as-is ] [ 189 Edited ] [ 46 Discarded ]
│                                                      │
│  ┌── TOP CORRECTIONS ──┐  ┌── ACCURACY BY CATEGORY ─┐│
│  │ Missing deadline 34x │  │ Maintenance      91%  ✓ ││
│  │ Wrong person    28x │  │ Cleaning         87%  ✓ ││
│  │ Too aggressive  19x │  │ Move in/out      78%    ││
│  │ Missing context 14x │  │ Safety           72%    ││
│  │ Too soft        11x │  │ Owner relations  43%  ✗ ││
│  └─────────────────────┘  │ Turnaround       65%    ││
│                            └─────────────────────────┘│
│                                                      │
│  ┌── ACCEPTANCE TREND (30 days) ─────────────────┐   │
│  │ ▁▂▂▁▃▃▂▃▂▃▃▃▄▃▄▃▅▃▅▄▄▅▄▅▄▅▅▅▅█             │   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌── REVISION LOG ───────────────────────────────┐   │
│  │ [All] [Edited] [Discarded]                    │   │
│  │                                               │   │
│  │ Owner chasing occupancy  C6  3 rev   Sent v3  │   │
│  │ AC leaking B-11-19       C4  1 rev   Sent v1  │   │
│  │ Noise complaint 11pm     C7  2 rev   Sent v2  │   │
│  │ Cleaning SLA missed      C3  disc    Discarded│   │
│  └───────────────────────────────────────────────┘   │
│                                                      │
│  ┌── AUTONOMY STATUS ────────────────────────────┐   │
│  │ Category          Rate  Last20  Status        │   │
│  │ Maintenance       91%   19/20   [Auto ✓]      │   │
│  │ Cleaning          87%   17/20   [Eligible]     │   │
│  │ Owner relations   43%   8/20    Manual         │   │
│  └───────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┘
```

**Sections:**

1. **Stat cards (4)** — Total proposals / Sent as-is (green) / Edited before send (amber) / Discarded (red). JetBrains Mono numbers, 22px. Each shows count + percentage.

2. **Two-column panel:**
   - Left: **Top correction patterns** — ranked bar chart of tag frequency. Amber bars. Tag name + count.
   - Right: **Accuracy by category** — horizontal bars per category. Color: green >80%, amber 50-80%, red <50%. Shows auto-send eligible/enabled badge for qualifying categories.

3. **Acceptance trend** — 30-day bar chart. Each bar = one day. Green if acceptance ≥70%, amber if 50-69%, red if <50%. Simple CSS bars, no chart library needed.

4. **Revision log** — paginated feed of all proposals. Filter pills: All / Edited / Discarded. Each row: incident title, cluster, category, revision count, final state (Sent v1/v2/v3 or Discarded). Click → navigates to incident detail page.

5. **Autonomy status table** — per-category breakdown: category name, acceptance rate, last-20 window visualization, consecutive streak, auto-send toggle. Toggle is a switch that calls `PATCH /api/learning/categories/[category]/autonomy`. Only enabled when `auto_send_eligible = true`.

**Sidebar entry:**
- Icon: brain/learning icon (similar to the existing sidebar icon style)
- Label: "Learning"
- Position: after Watchdog, before Settings
- No badge initially (consider adding a "new patterns" badge later)

### 7.3 Sidebar update

Add `/learning` to the sidebar navigation in `components/layout/Sidebar.tsx`:

```typescript
{
  name: 'Learning',
  href: '/learning',
  icon: BrainIcon,  // or AcademicCapIcon from heroicons, or custom SVG
}
```

Position: after Watchdog (`/watchdog`), before Settings (`/settings`).

---

## 8. Integration Points — Where to Hook In

### 8.1 On incident creation (existing flow)

When `lib/incidents.ts` creates an incident and generates the AI proposal:

```typescript
// After AI proposal is generated:
import { createInitialRevision } from '@/lib/learning/revision-manager'

// ... existing classification + proposal code ...

await createInitialRevision(
  incident.id,
  proposal.text,
  proposal.confidence,
  { prompt: usage.prompt_tokens, completion: usage.completion_tokens }
)
```

### 8.2 On Lee's decision (existing /api/incidents/[id]/decide)

When Lee approves, the existing decide handler should call `finalizeRevisionChain()`:

```typescript
import { finalizeRevisionChain } from '@/lib/learning/revision-manager'

// Determine outcome
const version = incident.current_version || 1
const outcome = version === 1 ? 'approved' : 'edited'

await finalizeRevisionChain(incident.id, outcome)
```

When Lee discards (existing trash/discard flow):

```typescript
await finalizeRevisionChain(incident.id, 'discarded')
```

### 8.3 On AI proposal generation (inject category feedback)

When `lib/incidents.ts` builds the classification/proposal prompt, inject category feedback:

```typescript
import { getCategoryFeedbackForPrompt } from '@/lib/learning/category-feedback'

const categoryRules = await getCategoryFeedbackForPrompt(classifiedCategory)

// Add to prompt:
if (categoryRules.length > 0) {
  prompt += `\n\nLearned rules for "${classifiedCategory}" (from Lee's past corrections):\n`
  prompt += categoryRules.map((r, i) => `${i + 1}. ${r.rule}`).join('\n')
}
```

### 8.4 Auto-send check (future — when autonomy gate is active)

Before sending a proposal automatically:

```typescript
import { supabaseAdmin } from '@/lib/supabase-admin'

const { data: catStats } = await supabaseAdmin
  .from('category_learning_stats')
  .select('auto_send_enabled, auto_send_eligible')
  .eq('category', incident.category)
  .single()

const canAutoSend = catStats?.auto_send_enabled && catStats?.auto_send_eligible
```

If `canAutoSend`, skip the approval queue and send directly. Log to watchdog with `was_auto_sent: true`.

---

## 9. Types

```typescript
// lib/types.ts — add these

export interface ProposalRevision {
  id: string
  incident_id: string
  version_number: number
  proposal_text: string
  ai_confidence: number | null
  feedback_text: string | null
  feedback_tags: string[]
  is_final: boolean
  outcome: 'approved' | 'edited' | 'discarded' | 'pending'
  ai_prompt_tokens: number | null
  ai_completion_tokens: number | null
  past_feedback_injected: boolean
  created_at: string
  decided_at: string | null
}

export interface RevisionFeedback {
  tags: string[]
  text: string
}

export interface CategoryLearningStats {
  id: string
  category: string
  total_proposals: number
  approved_v1: number
  approved_edited: number
  discarded: number
  acceptance_rate: number
  edit_rate: number
  last_20_outcomes: string[]
  consecutive_approvals: number
  auto_send_eligible: boolean
  auto_send_enabled: boolean
  top_tags: { tag: string; count: number }[]
  updated_at: string
}

export interface CategoryFeedbackRule {
  rule: string
  source_count: number
  example_feedback: string
}

export type FeedbackTag =
  | 'Wrong person'
  | 'Wrong tone'
  | 'Missing deadline'
  | 'Missing context'
  | 'Too aggressive'
  | 'Too soft'
  | string  // extensible — custom tags allowed

export const DEFAULT_FEEDBACK_TAGS: FeedbackTag[] = [
  'Wrong person',
  'Wrong tone',
  'Missing deadline',
  'Missing context',
  'Too aggressive',
  'Too soft',
]
```

---

## 10. Files to Create

```
lib/learning/
├── revision-manager.ts        — createInitialRevision, submitFeedback, regenerateProposal, finalizeRevisionChain
├── prompt-builder.ts          — buildRegenerationPrompt
├── category-feedback.ts       — getCategoryFeedbackForPrompt
└── category-stats.ts          — recomputeCategoryStats

app/api/incidents/[id]/revisions/
├── route.ts                   — GET revision chain
├── feedback/route.ts          — POST feedback
└── regenerate/route.ts        — POST regenerate

app/api/learning/
├── stats/route.ts             — GET global stats
├── categories/route.ts        — GET per-category stats
├── categories/[category]/autonomy/route.ts — PATCH toggle
├── patterns/route.ts          — GET top correction patterns
├── trend/route.ts             — GET 30-day trend
└── log/route.ts               — GET revision log feed

app/(dashboard)/learning/
└── page.tsx                   — Learning analytics page

components/learning/
├── StatCards.tsx               — 4 metric cards
├── CorrectionPatterns.tsx      — ranked bar chart
├── CategoryAccuracy.tsx        — horizontal bars + autonomy badges
├── AcceptanceTrend.tsx         — 30-day sparkline
├── RevisionLog.tsx             — filterable feed
└── AutonomyStatus.tsx          — per-category table + toggles

components/command/
└── ProposalRevisionPanel.tsx   — enhanced right panel (replaces static proposal)
```

## 11. Files to Update

```
lib/types.ts                   — add ProposalRevision, CategoryLearningStats, etc.
lib/incidents.ts               — hook createInitialRevision after AI proposal, inject category feedback
app/api/incidents/[id]/decide/route.ts — call finalizeRevisionChain on approve/discard
components/command/IncidentDetail.tsx (or IncidentPage.tsx) — replace proposal section with ProposalRevisionPanel
components/layout/Sidebar.tsx  — add /learning entry
middleware.ts                  — add /learning to protected routes
supabase/migrations/           — new migration file

```

---

## 12. Testing Plan

### 12.1 Revision chain lifecycle

1. Create a test incident via webhook or manual creation
2. Verify v1 revision created in `proposal_revisions` table
3. Open incident detail → see "v1 of 1" badge + proposal text
4. Tap [Wrong person] + [Missing deadline] tags → both highlight
5. Type feedback: "Don't tag Adam, this is Linda's scope"
6. Click [Regenerate] → loading spinner → v2 appears
7. Verify v2 proposal addresses the feedback (mentions Linda, not Adam)
8. Verify v1 collapses into accordion with feedback block
9. Repeat: add more feedback → [Regenerate] → v3
10. Click [Approve & Send] → v3 becomes final, green checkmark
11. Verify `proposal_revisions` table has 3 rows, v3 is `is_final=true, outcome='approved'`
12. Verify `incidents` table has `current_version=3, total_revisions=2, proposal_outcome='edited'`

### 12.2 Category stats

1. Create 5 incidents in "Maintenance" category
2. Approve 4 as v1 (no edits), edit 1 to v2 then approve
3. Check `/api/learning/categories` → Maintenance: 80% acceptance, 20% edit rate
4. Verify `last_20_outcomes` has correct rolling window
5. Verify `auto_send_eligible = false` (need 95% of 20)

### 12.3 Feedback injection

1. Create 3 incidents in same category with same correction (e.g., "Missing deadline" x3)
2. On 4th incident in same category, check AI prompt includes learned rule
3. Verify v1 proposal now includes a deadline (learned from past corrections)
4. Verify `past_feedback_injected = true` in proposal_revisions

### 12.4 Learning page

1. Navigate to `/learning`
2. Verify stat cards show correct totals
3. Verify correction patterns sorted by count
4. Verify category accuracy bars + color coding (green/amber/red)
5. Verify 30-day trend renders bars
6. Verify revision log shows recent decisions
7. Filter by "Edited" → only edited proposals show
8. Click a row → navigates to incident detail page
9. Verify autonomy toggles only enabled for eligible categories

### 12.5 Discard flow

1. Open incident → feedback → discard
2. Verify `outcome='discarded'` on final revision
3. Verify category `consecutive_approvals` resets to 0
4. Verify discarded entry appears in revision log with red badge

---

## 13. Done Criteria

- [ ] Migration creates `proposal_revisions` and `category_learning_stats` tables
- [ ] Migration adds columns to `incidents` (current_version, total_revisions, proposal_outcome, proposal_decided_at, feedback_tags_accumulated)
- [ ] `lib/learning/revision-manager.ts` exports all 4 functions
- [ ] `lib/learning/prompt-builder.ts` builds regeneration prompts with full chain + category rules
- [ ] `lib/learning/category-feedback.ts` extracts top correction patterns (threshold: 3+ occurrences)
- [ ] `lib/learning/category-stats.ts` recomputes rolling window + autonomy eligibility
- [ ] All 6 `/api/learning/*` routes return correct data
- [ ] All 3 `/api/incidents/[id]/revisions/*` routes work
- [ ] `ProposalRevisionPanel.tsx` renders with: tag pills, feedback textarea, regenerate button, version accordion, status pills
- [ ] Quick tags toggle on/off correctly, multiple selection works
- [ ] Regenerate shows loading state, returns new version, updates accordion
- [ ] Approve & Send finalizes chain + sends message + updates stats
- [ ] Discard finalizes chain + resets consecutive approvals
- [ ] `/learning` page renders all 5 sections with real data
- [ ] Correction patterns sorted by count descending
- [ ] Category accuracy uses correct color bands (green >80%, amber 50-80%, red <50%)
- [ ] 30-day trend chart renders with correct colors
- [ ] Revision log filterable by All/Edited/Discarded
- [ ] Autonomy toggle only enabled when `auto_send_eligible = true`
- [ ] Sidebar shows "Learning" entry after Watchdog
- [ ] `lib/incidents.ts` creates v1 revision on new incidents
- [ ] `lib/incidents.ts` injects category feedback into proposal prompts
- [ ] Existing decide flow calls `finalizeRevisionChain()`
- [ ] `tsc --noEmit` passes
- [ ] Committed to both `dev` and `main` branches
- [ ] Watchdog logs regeneration events

---

## 14. Claude Code Prompt

```
Read CLAUDE.md, then read docs/features/NUCLEUS-PROPOSAL-LEARNING-ENGINE-SPEC.md completely, then load all skills in CLAUDE.md, then build everything in the spec from the database migration through Done Criteria — start with the migration file (proposal_revisions + category_learning_stats tables + incidents alterations), then lib/types.ts additions, then the four lib/learning/ modules (revision-manager.ts, prompt-builder.ts, category-feedback.ts, category-stats.ts), then the API routes (/api/incidents/[id]/revisions/* first, then /api/learning/*), then hook into existing lib/incidents.ts (createInitialRevision on proposal generation + category feedback injection into prompts) and app/api/incidents/[id]/decide/route.ts (finalizeRevisionChain on approve/discard), then build ProposalRevisionPanel.tsx replacing the static proposal section in the incident detail page, then build the /learning page with all 5 sections and sidebar entry, complete each step fully before moving to the next and run tsc --noEmit before committing.
```

---

*Confidential — BeLive Property Hub / Spacify Technologies*
