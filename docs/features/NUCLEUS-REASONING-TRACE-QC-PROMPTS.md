# BeLive Nucleus — Reasoning Trace QC Prompts

**Purpose:** Single-prompt verification sequence for the Reasoning Trace + Backend Upgrade feature. Run these in a fresh Claude Code session after the build is complete. Each prompt is self-contained — paste one, get a pass/fail signal, move to the next.

**Related:** `NUCLEUS-REASONING-TRACE-SPEC.md` (the spec this verifies)
**Version:** 1.0
**Date:** 11 April 2026

---

## How to use

1. Open a fresh Claude Code session in the `belive-nucleus/` directory.
2. Paste one prompt at a time.
3. Claude will read the relevant files, execute the check, and report PASS or FAIL with evidence.
4. If FAIL, fix the issue and re-run the same prompt.
5. Do not proceed to the next prompt until the current one passes.

---

## QC 1 — Migration integrity

```
Read supabase/migrations/20260411000000_reasoning_trace_and_routing.sql and verify:

1. incident_reasoning_traces table is created with columns: id, incident_id, step_name, step_order, decision, decision_detail, confidence, reasoning_text, narrative_text, narrative_generated_at, model_version, generated_by, input_signal, created_at
2. step_name has a CHECK constraint listing exactly: matching, is_incident, classification, priority, routing, voice_fit
3. confidence has a CHECK BETWEEN 0 AND 100
4. UNIQUE(incident_id, step_name) is enforced
5. Indexes: idx_reasoning_incident, idx_reasoning_low_conf (partial WHERE confidence < 70), idx_reasoning_step_conf, idx_reasoning_created
6. ALTER TABLE incidents adds: min_reasoning_confidence, assigned_to, merged_from_incident_id, merge_count
7. Trigger recompute_min_reasoning_confidence is installed and fires AFTER INSERT OR UPDATE OF confidence
8. ALTER TABLE proposal_revisions adds reasoning_feedback_tags text[] DEFAULT '{}'
9. routing_pics table is seeded with exactly 5 rows: Fatihah, Fariha, Adam, Linda, David — each with correct role and default_categories
10. RLS policies are enabled on incident_reasoning_traces and routing_pics with service_role_all policy

Then run: supabase db reset (if the CLI is available) or apply the migration against a clean test DB and verify no errors. Report PASS or FAIL with line numbers for any failures.
```

---

## QC 2 — Matcher regression lock

```
This is the regression lock for the bug that motivated this entire feature. Do not skip.

Read lib/matching/incident-matcher.ts. Create a test fixture in a scratch file (e.g. /tmp/matcher-test.ts) that:

1. Seeds a test incident in the DB with:
   - cluster: 'C10'
   - thread_keywords: ['b-15-06', 'occupancy', 'owner', 'chasing']
   - status: 'awaiting_lee'
   - lark_root_id: 'original-thread-123'
   - created_at: 2 hours ago
   - title: 'Owner chasing 50% occupancy — C10 B-15-06'

2. Calls findMatchingIncident with:
   - cluster: 'C10'
   - lark_root_id: 'DIFFERENT-thread-456'   (← critical: NOT the same root_id)
   - raw_content: 'Maintenance list update: A-12-03 aircon done, B-15-06 mentioned in passing, C-07-11 plumbing pending, D-22-05 lock replaced'
   - sender_open_id: 'test-sender'

3. Asserts the result:
   - decision MUST === 'new'  (NOT 'merge')
   - signal SHOULD === 'unit_cluster'
   - confidence SHOULD === 55 (or close — below 70)
   - reasoning text SHOULD mention "below 40% threshold" or "conservatism rule"

Run the test. Clean up the seed row after. Report PASS or FAIL.

If FAIL: the matcher is over-eager. This is the exact bug this feature was built to prevent. Fix the matcher before proceeding to any other QC.
```

---

## QC 3 — Matcher positive merge cases

```
Test the three signal cascade paths. Create three separate test cases, each seeding then cleaning up:

CASE A — Root ID match:
- Seed incident with lark_root_id = 'test-root-a'
- Call findMatchingIncident with matching lark_root_id
- Assert: decision='merge', signal='root_id', confidence=95

CASE B — Ticket ID match:
- Seed incident with thread_keywords containing 'BLV-RQ-26005216'
- Call findMatchingIncident with raw_content containing 'BLV-RQ-26005216'
- Assert: decision='merge', signal='ticket_id', confidence=92

CASE C — Unit+cluster+high overlap:
- Seed incident in cluster 'C05' with thread_keywords ['a1-21-09', 'water', 'bill', 'abnormal']
- Call findMatchingIncident with cluster='C05', raw_content='A1-21-09 water bill still abnormal, owner complained again'
- Assert: decision='merge', signal='unit_cluster', confidence >= 75 and <= 90
- Assert: decision_detail.keyword_overlap >= 0.4

Report PASS per case + overall.
```

---

## QC 4 — End-to-end classification writes 6 traces

```
Read lib/incidents.ts and app/api/events/lark/route.ts (or wherever the Lark webhook lives).

Post a realistic Lark webhook payload through the webhook endpoint (use curl or a Node script). Use a message like:
  "Urgent: A2-14-07 aircon not cold, tenant very frustrated, been 3 days already. Please check asap."

After the webhook processes, verify:

1. A new row in `incidents` table exists with:
   - assigned_to populated (should be 'Fariha' for air_con category)
   - min_reasoning_confidence IS NOT NULL
   - status is either 'awaiting_lee' or 'acting'

2. Exactly 6 rows in incident_reasoning_traces for this incident_id, one per step:
   - matching (generated_by='deterministic', model_version IS NULL)
   - is_incident (generated_by='llm', model_version='claude-sonnet-4-6')
   - classification (same)
   - priority (same)
   - routing (same, decision should be 'Fariha')
   - voice_fit (same)

3. Each trace row has non-empty reasoning_text (≤ ~150 chars)

4. incidents.min_reasoning_confidence equals MIN(confidence) across the 6 trace rows (trigger fired correctly)

5. A proposal_revisions row was created for this incident with version_number=1

Report PASS or FAIL with SQL queries as evidence.
```

---

## QC 5 — Merge path + timeline append

```
Verify the merge path on createIncident:

1. Seed an incident A in cluster 'C03' with lark_root_id='merge-test-root' and a timeline entry
2. Post a second Lark webhook message with the SAME lark_root_id but different content
3. After processing, verify:
   - NO new incident row created
   - Incident A's merge_count incremented from 0 to 1
   - Incident A's timeline table has 2 entries now (original + the new message)
   - A new incident_reasoning_traces row exists for incident A with step_name='matching', decision='merge', confidence=95, signal='root_id'
   - Incident A's min_reasoning_confidence reflects the newly-written matching row (if it's the lowest)

4. Post a THIRD message with the same root_id
5. Verify merge_count is now 2 and timeline has 3 entries
6. Verify the matching trace row was UPSERTED (not duplicated) — still only one matching row per incident

Report PASS or FAIL. Clean up seed data.
```

---

## QC 6 — Low-confidence UI surfacing

```
Verify the red-dot flag surfaces correctly at all three UI points.

1. Pick any existing incident (or create a test one via webhook)
2. Run SQL: UPDATE incident_reasoning_traces SET confidence = 45 WHERE step_name = 'matching' AND incident_id = '<id>'
3. Verify the trigger fired: SELECT min_reasoning_confidence FROM incidents WHERE id = '<id>' should return 45

4. Open the Command Center page in a browser (or read the rendered HTML via fetch):
   - Verify the row for this incident has a red dot element (class with bg-[#E05252] or similar)
   - Verify the tooltip/title mentions "Low reasoning confidence"

5. Check the sidebar component rendering:
   - Verify the /reasoning nav entry has a red dot overlay
   - Verify the count query (/api/reasoning/stats) returns low > 0

6. Open the incident detail page:
   - Verify ReasoningPanel header shows "min confidence 45% ⚠"
   - Verify the matching step row has a warning icon
   - Verify the confidence pill color is #E05252

Report PASS or FAIL per surface. Reset the confidence to its original value after.
```

---

## QC 7 — Narrative generation + caching

```
Verify the on-demand narrative generator works and caches correctly.

1. Pick an incident with a populated reasoning trace
2. SQL: verify narrative_text IS NULL for all 6 step rows on this incident
3. Call POST /api/incidents/<id>/reasoning/narrative with body { "step": "classification" }
4. Verify:
   - Response contains a narrative string 3-5 sentences long
   - DB now has narrative_text populated for the classification step
   - narrative_generated_at is set to roughly now
   - Other 5 step rows still have NULL narrative_text

5. Call the same endpoint AGAIN with the same step
6. Verify:
   - Response is identical (cached)
   - narrative_generated_at is UNCHANGED (no re-generation)
   - No new Claude API call was made (check server logs for claude-sonnet-4-6 invocations if logging is available)

7. Check the UI flow: expand the classification step on the incident detail page, click "Deeper explanation", verify:
   - Loading state appears briefly
   - Narrative text replaces the short reasoning text
   - Clicking "Hide narrative" / re-clicking toggles without re-fetching

Report PASS or FAIL with evidence.
```

---

## QC 8 — Reasoning feedback tagging + Learning Engine integration

```
Verify reasoning-step feedback writes to the correct column and feeds back into future prompts.

PART 1 — write path:
1. Pick an incident with a proposal_revisions row (v1)
2. Call POST /api/incidents/<id>/reasoning/feedback with body { "tags": ["wrong_routing"] }
3. Verify:
   - proposal_revisions.reasoning_feedback_tags for v1 now contains ['wrong_routing']
   - proposal_revisions.feedback_tags (the proposal-level column) is UNCHANGED (still empty or whatever it was)

PART 2 — feedback injection into future classification:
4. Create 3 more incidents in the same category (e.g. 'complaint') and tag them ALL with 'wrong_routing'
   - You can call the feedback endpoint directly for each
5. Read lib/learning/reasoning-feedback.ts and call getCategoryReasoningRulesForPrompt('complaint') directly in a scratch script
6. Verify it returns at least one rule string (count >= 3 threshold)
7. Now classify a new complaint-category message and inspect the prompt passed to Claude (you may need to add a temporary console.log in lib/reasoning/prompt-builder.ts)
8. Verify the learned reasoning rule appears inside the <learned_rules> / LEARNED REASONING RULES section of the system prompt

PART 3 — UI flow:
9. Open an incident detail page, expand any step, click "Tag as wrong"
10. Verify the button shows "✓ tagged" and is disabled
11. Verify the DB got the corresponding tag

Report PASS or FAIL per part. Clean up test data after.
```

---

## QC 9 — /reasoning page rendering + filters + calibration

```
Verify the full /reasoning page.

1. Navigate to /reasoning in the browser
2. Verify 4 stat cards render with non-zero totals (assuming prior QCs generated data)
3. Verify CalibrationChart renders with at least one category row showing:
   - 5 step rows (matching, is_incident, classification, priority, routing, voice_fit)
   - stated %, actual %, and gap column
   - Gap cells > 15 are colored red
4. Verify TraceLog renders with rows sorted by confidence ascending (worst first)
5. Apply each filter one at a time:
   - Step filter: click 'matching' → verify only matching rows appear
   - Band filter: click '<70' → verify all rows have confidence < 70
   - Category dropdown: pick one → verify only that category
   - Cluster dropdown: pick one → verify only that cluster
6. Click any trace log row
7. Verify navigation to /command with incident pre-selected AND ReasoningPanel pre-expanded on the target step
   (Hint: this uses a query param like ?incident=...&expandStep=...)

8. Inspect the network calls:
   - /api/reasoning/stats fires once on mount
   - /api/reasoning/calibration fires once on mount
   - /api/reasoning fires on mount and on every filter change

Report PASS or FAIL per section.
```

---

## QC 10 — Fallback paths + no regression

```
Verify that when things fail, nothing regresses.

TEST A — LLM failure:
1. Temporarily break the Anthropic API key env var (rename ANTHROPIC_API_KEY to ANTHROPIC_API_KEY_BROKEN)
2. Post a Lark webhook message
3. Verify:
   - An incident is still created (NOT null)
   - incidents.min_reasoning_confidence IS NULL (not 0)
   - incident_reasoning_traces has at most 1 row (matching, deterministic) — no LLM rows written
   - incidents.assigned_to IS NULL
   - Status is 'awaiting_lee' (default conservative — not auto-acting)
   - No exception crashes the webhook handler
4. Restore the API key

TEST B — Voice fit fallback:
5. Read lib/incidents.ts analyseIncident and verify the fallback comment exists
6. Simulate the case where classifyResult.reasoning_steps.length < 6 (e.g. by temporarily short-circuiting the LLM response parser)
7. Verify the OLD formula (confidence >= 95 && priority !== 'P1') kicks in for the status gate
8. Verify no P1 incidents are auto-executed (status='acting') under fallback — they go to awaiting_lee

TEST C — Matcher empty input:
9. Call findMatchingIncident with empty raw_content and no lark_root_id
10. Verify it returns { decision: 'new', signal: 'none', confidence: 90, ... } — does not throw

TEST D — Token cost measurement:
11. Find the comment above classifyMessage in lib/incidents.ts documenting the token cost delta
12. Verify it includes:
    - Baseline avg tokens (before feature)
    - New avg tokens (after feature)
    - Multiplier (should be ~3x)
13. If the comment is missing, FAIL — the spec requires this measurement be persisted.

Report PASS or FAIL per test.
```

---

## QC 11 — Build health + commit gate

```
Final gate before considering the feature done.

1. Run: tsc --noEmit
   - Verify zero errors
   - If any errors exist, they MUST be fixed before proceeding

2. Run the test suite (if one exists): npm test or equivalent
   - Verify all tests pass
   - Verify the new matcher test from QC 2 is included

3. Verify the sidebar entry exists and is clickable:
   - Read components/layout/Sidebar.tsx
   - Verify NAV_ITEMS contains { href: '/reasoning', icon: Lightbulb, label: 'Reasoning' } between /learning and /settings

4. Verify Watchdog logs a new event type:
   - Grep for 'REASONING_TRACE_WRITTEN' in lib/activity-logger.ts or similar
   - Verify at least one place in lib/incidents.ts calls logger with this event type after writeFullTrace

5. Run git status — verify the following files are modified or created (minimum set):
   - supabase/migrations/20260411000000_reasoning_trace_and_routing.sql (new)
   - lib/types.ts (modified)
   - lib/incidents.ts (modified)
   - lib/matching/incident-matcher.ts (new)
   - lib/reasoning/prompt-builder.ts (new)
   - lib/reasoning/trace-writer.ts (new)
   - lib/reasoning/narrative-generator.ts (new)
   - lib/learning/reasoning-feedback.ts (new)
   - lib/learning/revision-manager.ts (modified)
   - app/api/incidents/[id]/reasoning/route.ts (new)
   - app/api/incidents/[id]/reasoning/narrative/route.ts (new)
   - app/api/incidents/[id]/reasoning/feedback/route.ts (new)
   - app/api/reasoning/route.ts (new)
   - app/api/reasoning/calibration/route.ts (new)
   - app/api/reasoning/stats/route.ts (new)
   - app/(dashboard)/reasoning/page.tsx (new)
   - components/command/ReasoningPanel.tsx (new)
   - components/command/IncidentDetail.tsx (modified)
   - components/command/CommandCenter.tsx (modified)
   - components/layout/Sidebar.tsx (modified)
   - components/reasoning/*.tsx (new, multiple files)
   - app/api/events/lark/route.ts or equivalent (modified — webhook refactor)

6. Verify commit message format:
   - After committing, run git log -1
   - Verify message is "feat(reasoning): per-step reasoning trace + real matcher + routing AI + voice_fit AI"
   - Verify Co-Authored-By trailer is present

Report PASS or FAIL per check. If ANY fail, do NOT merge to main.
```

---

## Pass/fail ledger

Use this table to track QC progress. Run top-to-bottom.

| # | QC | Status | Notes |
|---|---|---|---|
| 1 | Migration integrity | ☐ | |
| 2 | Matcher regression lock | ☐ | **Do not skip — this is the bug-fix validation** |
| 3 | Matcher positive merge cases | ☐ | |
| 4 | End-to-end classification writes 6 traces | ☐ | |
| 5 | Merge path + timeline append | ☐ | |
| 6 | Low-confidence UI surfacing | ☐ | |
| 7 | Narrative generation + caching | ☐ | |
| 8 | Reasoning feedback + Learning Engine | ☐ | |
| 9 | /reasoning page + filters + calibration | ☐ | |
| 10 | Fallback paths + no regression | ☐ | |
| 11 | Build health + commit gate | ☐ | Final gate |

Do not mark the feature shipped until all 11 are green.

---

*Confidential — BeLive Property Hub / Spacify Technologies*
