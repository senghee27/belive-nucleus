# Proposal Learning Engine — QC & Testing Prompts

Run these prompts in Claude Code AFTER the main build completes.
Go in order. Each prompt catches a different layer of issues.

---

## QC 1 — Compilation & Type Safety

Run this first. If this fails, nothing else matters.

```
Run tsc --noEmit and fix every error. Then verify these files exist and export correctly:
- lib/learning/revision-manager.ts exports: createInitialRevision, submitFeedback, regenerateProposal, finalizeRevisionChain
- lib/learning/prompt-builder.ts exports: buildRegenerationPrompt
- lib/learning/category-feedback.ts exports: getCategoryFeedbackForPrompt
- lib/learning/category-stats.ts exports: recomputeCategoryStats
- lib/types.ts exports: ProposalRevision, CategoryLearningStats, CategoryFeedbackRule, RevisionFeedback, FeedbackTag, DEFAULT_FEEDBACK_TAGS
Show me the export lines from each file.
```

---

## QC 2 — Database Migration

```
Show me the full contents of the new migration file in supabase/migrations/. Verify:
1. proposal_revisions table has: id, incident_id (FK), version_number, proposal_text, ai_confidence, feedback_text, feedback_tags (text[]), is_final, outcome (CHECK constraint), ai_prompt_tokens, ai_completion_tokens, past_feedback_injected, created_at, decided_at
2. UNIQUE constraint on (incident_id, version_number)
3. Indexes on incident_id, outcome, created_at
4. category_learning_stats table has: category (UNIQUE), total_proposals, approved_v1, approved_edited, discarded, acceptance_rate, edit_rate, last_20_outcomes (text[]), consecutive_approvals, auto_send_eligible, auto_send_enabled, top_tags (jsonb)
5. incidents table altered with: current_version, total_revisions, proposal_outcome (CHECK constraint), proposal_decided_at, feedback_tags_accumulated (text[])
6. RLS enabled on both new tables with service_role_all policies
7. updated_at trigger on category_learning_stats
Then run the migration: npx supabase db push
```

---

## QC 3 — Integration Hooks (Most Critical)

These are where bugs hide — the connections between the new system and existing code.

```
Show me the exact code where these 3 integration hooks are wired in:

HOOK 1 — lib/incidents.ts: After AI proposal generation, createInitialRevision() must be called with (incident.id, proposal.text, confidence, tokenUsage). Show me the surrounding 20 lines of code.

HOOK 2 — lib/incidents.ts: Category feedback injection. getCategoryFeedbackForPrompt(category) must be called and the result injected into the AI prompt BEFORE classification/proposal. Show me the surrounding 20 lines.

HOOK 3 — app/api/incidents/[id]/decide/route.ts: finalizeRevisionChain() must be called when Lee approves or discards. The outcome must be 'approved' if current_version === 1, 'edited' if current_version > 1, 'discarded' if discarding. Show me the surrounding 20 lines.

If any of these hooks are missing or incorrectly wired, fix them now.
```

---

## QC 4 — API Routes Smoke Test

```
Verify all 9 new API routes exist and have correct HTTP methods:

1. GET  /api/incidents/[id]/revisions — returns { revisions: [] }
2. POST /api/incidents/[id]/revisions/feedback — accepts { version, tags, text }
3. POST /api/incidents/[id]/revisions/regenerate — calls AI, returns { revision }
4. GET  /api/learning/stats — returns { total, approvedV1, approvedEdited, discarded, acceptanceRate, editRate, discardRate }
5. GET  /api/learning/categories — returns category_learning_stats rows
6. GET  /api/learning/patterns — returns top correction tags
7. GET  /api/learning/trend — returns { trend: [{ date, total, approved, rate }] }
8. GET  /api/learning/log — returns revision log (paginated)
9. PATCH /api/learning/categories/[category]/autonomy — accepts { enabled: boolean }

For each route, show me the file path and the exported function name (GET, POST, or PATCH). If any route is missing, create it now.
```

---

## QC 5 — UI Components Exist & Render

```
Verify these components exist and are properly imported where needed:

1. components/command/ProposalRevisionPanel.tsx — is it imported in the incident detail page? Does it replace the old static proposal section?
2. app/(dashboard)/learning/page.tsx — does it exist? Is /learning in the sidebar?
3. components/learning/StatCards.tsx — imported in learning page?
4. components/learning/CorrectionPatterns.tsx — imported?
5. components/learning/CategoryAccuracy.tsx — imported?
6. components/learning/AcceptanceTrend.tsx — imported?
7. components/learning/RevisionLog.tsx — imported?
8. components/learning/AutonomyStatus.tsx — imported?

Check components/layout/Sidebar.tsx — is /learning added after /watchdog?
Check middleware.ts — is /learning in the protected routes list?

Show me the sidebar entries array and the middleware route list.
```

---

## QC 6 — ProposalRevisionPanel Deep Check

This is the most complex UI component. Verify the details.

```
Open components/command/ProposalRevisionPanel.tsx and verify:

1. It fetches revisions from /api/incidents/[id]/revisions on mount
2. Quick tag pills render all 6 default tags: Wrong person, Wrong tone, Missing deadline, Missing context, Too aggressive, Too soft
3. Tags are toggleable — selectedTags state as string[], tap adds/removes
4. Feedback textarea exists with placeholder "Type your feedback on this proposal..."
5. Regenerate button: calls POST /api/incidents/[id]/revisions/feedback first, THEN calls POST /api/incidents/[id]/revisions/regenerate, shows loading state during AI call
6. Version accordion: each revision is collapsible, shows version_number, timestamp, feedback block if feedback_text exists
7. The "v3 of 3" badge shows current_version and total revisions
8. Approve & Send button calls the existing decide handler AND finalizeRevisionChain
9. Confidence score displays in the header (green %)
10. War room color palette used: #0D1525 surface, #1A2035 borders, #F2784B coral, #4BF2A2 green, #E8A838 amber, #080E1C deep bg

If any of these are wrong or missing, fix them now. Show me the full component after fixes.
```

---

## QC 7 — Learning Page Deep Check

```
Open app/(dashboard)/learning/page.tsx and verify:

1. Page fetches from all 5 API endpoints: /api/learning/stats, /categories, /patterns, /trend, /log
2. Stat cards show: Total, Sent as-is (green), Edited (amber), Discarded (red) — with JetBrains Mono numbers
3. Correction patterns: ranked bars sorted by count descending, amber color
4. Category accuracy: horizontal bars with color bands — green >80%, amber 50-80%, red <50%
5. Acceptance trend: 30-day bars, green/amber coloring
6. Revision log: filterable by All/Edited/Discarded, each row shows title, cluster, category, revision count, final state
7. Autonomy status: per-category table with toggle switch, toggle calls PATCH /api/learning/categories/[category]/autonomy, toggle disabled when auto_send_eligible is false
8. War room dark theme (#080E1C, #0D1525, #1A2035)

If anything is missing, fix it now.
```

---

## QC 8 — End-to-End Flow Test (Manual)

This one you run yourself on the live site after deploying. Not a Claude Code prompt — a checklist.

### Pre-test
- [ ] Deploy to dev branch
- [ ] Run migration (npx supabase db push)
- [ ] Open belive-nucleus.vercel.app (dev preview)

### Test 1: New incident creates v1 revision
- [ ] Trigger a Lark message that creates an incident (or create manually)
- [ ] Open incident detail page
- [ ] See "v1 of 1" badge + proposal text + confidence %
- [ ] Check Supabase: proposal_revisions has 1 row for this incident

### Test 2: Feedback + Regenerate cycle
- [ ] Tap [Wrong person] and [Missing deadline] tags — both highlight
- [ ] Type feedback: "Test feedback for revision"
- [ ] Click [Regenerate]
- [ ] Loading spinner appears
- [ ] v2 proposal appears with different text
- [ ] v1 collapses into accordion with your feedback block
- [ ] "v2 of 2" badge shows
- [ ] Check Supabase: proposal_revisions has 2 rows

### Test 3: Approve sends and locks chain
- [ ] Click [Approve & Send] (or [Test] for safety)
- [ ] v2 shows green checkmark, "final (sent)" label
- [ ] Feedback input zone disappears or disables
- [ ] Check Supabase: v2 has is_final=true, outcome='edited'
- [ ] incidents table: proposal_outcome='edited', current_version=2

### Test 4: Learning page loads
- [ ] Navigate to /learning
- [ ] Stat cards show numbers (may be small if few incidents)
- [ ] Correction patterns shows your tags
- [ ] Category accuracy shows at least the category you tested
- [ ] Revision log shows the incident you just tested
- [ ] Click the row — navigates to incident detail

### Test 5: Discard flow
- [ ] Create another incident, give feedback, then discard
- [ ] Check: outcome='discarded' in proposal_revisions
- [ ] Learning page: discarded count increases
- [ ] Category consecutive_approvals resets to 0

---

## QC 9 — Final Cleanup

```
Final checks before merge to main:

1. Run tsc --noEmit — must pass clean
2. Check for any console.log statements that should be removed (keep console.warn and console.error)
3. Verify no supabase-admin imports in any client component (components/ directory files that have 'use client')
4. Check that all new API routes have proper error handling (try/catch, return appropriate status codes)
5. Verify the regenerate endpoint has a reasonable timeout or token limit for the Claude API call
6. Check that the Supabase join query in category-feedback.ts works (incidents!inner join syntax)
7. Make sure /learning is added to the SECRET_ROUTES list in middleware if API routes need protection

If all clean, commit to dev and main, push both.
```

---

## Prompt Order Summary

| # | What | Type | When |
|---|------|------|------|
| QC 1 | Compilation | Claude Code | Right after build |
| QC 2 | Migration | Claude Code | After QC 1 passes |
| QC 3 | Integration hooks | Claude Code | Critical — do this before deploying |
| QC 4 | API routes exist | Claude Code | After QC 3 |
| QC 5 | UI components exist | Claude Code | After QC 4 |
| QC 6 | Revision panel deep | Claude Code | After QC 5 |
| QC 7 | Learning page deep | Claude Code | After QC 6 |
| QC 8 | E2E on live site | Manual (you) | After deploying to dev |
| QC 9 | Final cleanup | Claude Code | Before merge to main |

---

*Run QC 1-7 as Claude Code prompts in sequence.
QC 8 is your manual testing on the live dev site.
QC 9 is the final cleanup before production.*
