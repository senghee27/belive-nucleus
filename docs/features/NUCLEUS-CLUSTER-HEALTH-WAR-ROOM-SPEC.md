# NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC

**Feature:** Cluster Health — War Room View (`/clusters`)
**Status:** Spec locked, ready for build
**Owner:** Lee (product) / CJ (execution)

---

## 1. Purpose

Replace the current `/clusters` page with a two-mode war-room situation board. The commander (Lee) must scan 11 clusters and understand *what is actually happening* in 10 seconds — without reading ticket numbers, without clicking, without context-switching.

The page has **two modes toggled at the top**: **Tickets** (the operational pipeline — what work is open) and **Command** (the signal stream — what's coming at us that isn't yet a ticket). Same URL, same cluster-pill strip, same horizontal-scroll 11-column grid, same fixed-band layout — only the data layer swaps. Toggling preserves scroll position.

**Why two modes:** Tickets and Incidents are fundamentally different data. Tickets are structured work items with SLAs, owners, and a lifecycle, sourced from the ops system. Incidents are unstructured Lark chat signals that may or may not become work, sourced from the classification pipeline. Mixing them in one column — as the current build does — causes the same underlying issue to appear twice and leaves the commander unable to tell work-to-do from signals-to-triage. Separating them gives each data source the treatment it deserves.

---

## 2. Layout

- **Horizontal scroll**, one fixed 440px column per cluster, 11 total. No vertical scroll — strict 1-page height.
- **Cluster pills strip** top-right, natural order `C1 → C11`. Each pill carries a severity dot (worst open in that cluster, computed differently per mode — see §2.1).
- **Mode toggle** top-left, segmented control `[Tickets] [Command]`. Default: Tickets. Toggling preserves scroll position and selected cluster.
- **Tickets mode bands:** Maintenance (top 10) → Cleaning (top 3) → Move In (top 3) → Move Out (top 3).
- **Command mode band:** single Incidents band showing only incidents where `attention_required = true` from the Reasoning Trace, sorted by severity → recency, capped at the vertical budget (~20 slots per cluster).

**Count rationale (Tickets mode):** Maintenance carries the diagnostic weight — volume, variety, and the clearest pattern signal. The other three categories only need top 3 to answer "is this cluster's pipeline on fire?"

**Filter rationale (Command mode):** the Reasoning Trace's `attention` step is literally the filter for what appears here. 220 raw incidents across 11 clusters would drown the commander; filtering on `attention_required` surfaces only the 3–5 per cluster that actually need Lee's eyes. This is the architectural consumer that validates the Reasoning Trace's attention step.

### 2.1 Severity Dot on Cluster Pills

The colored dot on each cluster pill reflects the *current mode's* worst state:
- **Tickets mode:** worst SLA state across all open tickets in that cluster (overdue > due-soon > on-time)
- **Command mode:** highest severity among `attention_required` incidents in that cluster

This means flipping the toggle re-colors the pills, which is intentional — the pills should always reflect "what's hot in the view I'm looking at."

---

## 3. Row Format — Situation Reports

All rows are single-line 38px cards in both modes. Row content differs by mode:

### 3.1 Tickets Mode Row

**Line 1:** severity dot · SLA pill (`43d OVR`, `12h`) · **situation line** · owner
- Source: operational ticketing tables
- Ranking: **overdue first, then age descending within each SLA bucket**

**The situation line is the core of this feature.** It must answer *"what is physically broken and why isn't it fixed yet?"* — nothing else. Format: `{what is broken, where} · {blocker or state}`. Mandatory blocker clause; when ticketing data has no update, fallback is literal `no update`. The absence of data is itself diagnostic — a column showing "no update" 31 times tells the commander the ops system is silent on that cluster.

**Examples of correct situation lines:**
- `Washer broken at B-12-04 · tenant escalated twice`
- `Tile popped in corridor · contractor quoted, not scheduled`
- `Aircon compressor failed 21-08 · vendor waiting on KL parts`
- `Leaking pipe 11-01 · temp patch holding, permanent fix pending`
- `Dryer drum noise · no update`

**Forbidden phrasings (the current build's failure mode):**
- ~~"This is an overdue normal priority maintenance request"~~ (meta-commentary, tells nothing)
- ~~"Critical priority maintenance ticket overdue by 6 days"~~ (duplicates the pill)
- ~~"High priority maintenance request with SLA..."~~ (bureaucratic filler)

The situation line must never mention priority, SLA, overdue status, "ticket," or "request" — those are already carried by the severity dot, SLA pill, and section header. Every word in the line must earn its place by describing physical reality or blockers.

**AI summarizer prompt** (runs during classification, cached in `ai_situation_line` field on the ticket record):

> Given this maintenance/cleaning/move ticket, write a ≤12-word situation report in the format: `{what is physically broken or needs action, where} · {current blocker or state}`. Do not mention priority, SLA, overdue status, or the words "ticket" or "request" — those are shown separately. Use concrete nouns. If the blocker is unknown from available data, write "no update" as the second clause. Examples: "Washer broken at B-12-04 · tenant escalated twice" / "Tile popped in corridor · contractor quoted, not scheduled" / "Dryer drum noise · no update".

Summaries are regenerated when the ticket is updated (new comment, status change, owner reassignment) so "no update" correctly transitions to a real blocker once data arrives.

**Click behavior:** every row is clickable, opens the detail drawer (§3.4).

### 3.2 Command Mode Row
**Line 1 (compact, monospace dim):** severity dot · SLA pill · age
**Line 2 (the context):** AI-generated situation summary, ≤140 chars, owner trailing in dim text
- Source: Lark connector + classification pipeline
- Ranking: severity → recency, filtered to `attention_required = true` only
- **AI summary always visible** — load-bearing here because raw Lark text is messy
- `[unclassified]` amber fallback renders first 80 chars of raw Lark text when classification hasn't completed yet
- Row height: 2-line cards at ~54px. Because Command mode has only one band, the taller rows fit comfortably in the vertical budget.

### 3.3 Why Asymmetric Treatment

Tickets have operational data in a ticketing system — the AI's job is to distill it into a physical-reality situation line with a blocker. Incidents come from raw Lark chat where the AI is doing load-bearing work turning "aircond tak sejuk dah 3 hari" into a diagnosed situation. Each data source gets the treatment matching its raw input quality.

### 3.4 Detail Side Panel

Every row in either mode is clickable. Click opens a **400px right-side slide-in panel** covering the rightmost portion of the viewport, keeping the grid visible behind it so the commander can jump between rows without losing scroll position or mental context.

**Panel contents (top to bottom):**
- Header: ticket#/incident_id, cluster, owner, current status, close (×) button
- Full human-written title (tickets) or raw Lark message (incidents)
- Full AI situation line with the 6-step Reasoning Trace inline, each step's conclusion + confidence + rationale visible
- Timeline: status changes, owner reassignments, comments, photos if any
- Raw Lark source messages for incidents; ticket history for tickets
- Action buttons: reassign, close, escalate, add comment

The panel is the same pattern as the `/reasoning/:id` page from the Reasoning Trace spec, just rendered as a slide-in instead of a standalone route. Clicking another row while the panel is open swaps the content without animation — no close-reopen flicker.

## 3.5 Column Width and Viewport Density

Column width: **480px** (up from 440px). At 1440px viewport, exactly **3 columns visible per screen**, plus partial peek of the 4th to signal scrollability. Horizontal scroll reveals C4–C11 in sequence. The wider column buys breathing room for the situation line + blocker clause without truncation.

Why 3 instead of the earlier ~3.3: honest spacing beats cramped density. The situation line is the page's entire value proposition — if it truncates, the feature fails. 480px gives the line ~340px of usable text width after severity dot, pill, and owner, enough for 12 words at 11.5px without ellipsis.

---

## 3.5 Fixed-Band Grid (critical)

Every category occupies a **fixed vertical band across all 11 columns** so the commander's eye sweeps horizontally without bouncing. Maintenance is always rows 1–10, Cleaning always 11–13, Move In always 14–16, Move Out always 17–19, Incidents always 20–22 — *regardless* of how many actual tickets each cluster has in that category.

**Why:** without this, C1's Maintenance header sits at Y=120 and C3's Maintenance header (which has fewer rows above it) sits at Y=80, forcing diagonal scanning. Diagonal scanning kills the war-room utility. Fixed bands turn the layout into a true matrix where one horizontal sweep reveals the entire fleet's state for one category.

**Empty slots:** unused row slots in a band render as ultra-faint dotted placeholders (`#1a1a1f` background, 1px dashed `#1f1f23` border, 32px tall, no text). The `0` count in the section header already communicates "empty" — placeholders only hold the geometry. Never collapse, never show "No open items" text floating in space.

**Strict top-N enforcement:** if a section's cap is 3, exactly 3 rows render even if vertical space allows more. The `+N more →` link carries the rest. The bug in the current screenshot where C1 Incidents shows 4 rows because the column is taller is exactly what fixed bands eliminate.

## 4. P1 Row Tinting

Rows where severity = P1 receive a subtle coral background tint (`rgba(255, 90, 78, 0.06)`) and a 2px coral left-border. This makes catastrophic rows pop at scan distance without drowning the column in color.

---

## 5. Unclassified Incidents

When an incident has no AI classification yet (newly arrived from Lark, `#—` unlogged):

- Line 2 renders as `[unclassified] {first 80 chars of raw Lark message} — {owner}`
- Text color switches to amber `#f5a524` so the commander instantly sees "AI hasn't touched this yet"
- Raw tenant voice is preserved (often more diagnostic than a polished summary — e.g. *"aircond tak sejuk dah 3 hari, bilik panas gila"*)
- Once classification completes, the row transitions to normal AI summary on next refresh

---

## 6. Category Headers

Each category header shows `CategoryName` left, `{total} · {overdue} ovr` right. The overdue count is itself a diagnostic — a commander seeing `131 · 95 ovr` on Maintenance instantly reads "72% overdue rate, this cluster is bleeding."

Each section ends with `+N more →` drilling to the per-cluster category view.

---

## 6.5 Owner Name Resolution Fix (system-wide)

The current war-room screenshot exposes a bug: owner fields are leaking raw open_ids (`cli_a95beb5592f8ded0`, `ou_c78ef9279e51a094beae47486eabc50b`) when `staff_directory` resolution fails. This makes the situation report unreadable — the commander sees a wall of hex strings instead of names.

**Fix:** the existing `resolveOwnerName(open_id)` util must, on resolution failure, return the dim string `— unknown` instead of the raw open_id. Apply system-wide everywhere `resolveOwnerName` is called: war-room rows, Command Center, Watchdog feed, Briefings, Mobile PWA, Reasoning Trace owner attribution. No more raw IDs reaching the UI under any code path.

This is a one-line fix in the resolver but a system-wide bug, and it ships in the same PR as the war-room redesign because the war-room is where it's most visible.

## 7. System-Wide Cluster Ordering

Add shared util `sortClustersNatural(clusters)` sorting by numeric suffix of cluster code. Apply everywhere clusters appear:

- `/clusters` (this redesign)
- Command Center cluster filter + "Cluster" sort tab
- Briefings → Send To destinations
- Watchdog cluster filter
- Mobile PWA Clusters tab
- Learning Engine per-cluster metrics
- Briefing schedule cluster selectors

Single source of truth — replace all existing alphabetical-string cluster sorting.

---

## 8. Vertical Budget (900px viewport)

| Section | Rows | Per row | Subtotal |
|---|---|---|---|
| Page header + pills strip | — | — | 70px |
| Maintenance (hdr 24 + 10×38) | 10 | 38px | 404px |
| Cleaning (hdr 22 + 3×38) | 3 | 38px | 136px |
| Move In (hdr 22 + 3×38) | 3 | 38px | 136px |
| Move Out (hdr 22 + 3×38) | 3 | 38px | 136px |
| Incidents (hdr 22 + 3×38) | 3 | 38px | 136px |
| "+N more" links (5×16) | — | — | 80px |
| **Total** | | | **~1,098px** |

Still over a strict 900px budget, but the gap is now manageable. Real-world fit target: **~900px on 1440×900** with row padding tightened to 5/5px top/bottom, line-1 at 10.5px, line-2 at 11.5px with 1.3 line-height, section headers compressed to 20px. If it still overflows on Lee's primary monitor, the single fallback lever is dropping Maintenance to top 8 — all other categories are already at their minimum.

---

## 9. Data Requirements

- AI summary field on `incidents` table: `ai_summary text` (≤140 chars, generated during classification step, refreshed on re-classification)
- `is_classified boolean` flag to drive the unclassified amber state
- `raw_lark_text text` preserved for the fallback render
- Existing `staff_directory` used for owner name resolution

---

## 10. Out of Scope (v1)

- Live refresh / websocket updates (polling every 30s is fine)
- Filtering or sorting within the war-room view
- Comparing clusters side-by-side beyond visual scroll
- Mobile PWA version (separate spec)

---

## 11. Claude Code Prompt

> Restructure `/clusters` into a two-mode war-room per `docs/features/NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md`. **Critical content quality fix:** replace the current AI summarizer which produces meta-commentary ("This is an overdue normal priority maintenance request") with a situation-line generator following the prompt in §3.1 that outputs `{what is broken, where} · {blocker or state}` with mandatory "no update" fallback. Regenerate summaries on ticket updates. Store in `ai_situation_line` field. **Layout:** 480px columns, 3 visible per 1440px viewport, horizontal scroll for C1→C11. Segmented toggle `[Tickets] [Command]` top-left, preserving scroll + cluster on mode change. **Tickets mode:** 4 bands (Maintenance top 10, Cleaning/MoveIn/MoveOut top 3), 1-line rows showing severity dot + SLA pill + situation line + owner, sorted overdue-first then age-desc. **Command mode:** single Incidents band filtered to `attention_required = true` from the Reasoning Trace, 2-line rows with always-visible AI summary, `[unclassified]` amber raw-Lark fallback, sorted severity→recency. **Detail side panel:** 400px right slide-in on row click, shows full Reasoning Trace inline, timeline, actions. Fixed-band grid with dotted placeholders, strict top-N. Cluster pill severity dots recompute per mode. Fix `resolveOwnerName()` to return `— unknown` on failure system-wide. Apply `sortClustersNatural()` system-wide. Add `ai_situation_line`, `ai_summary`, `is_classified`, `raw_lark_text` fields. **Data-source separation:** Tickets mode reads only operational tables, Command mode reads only the incidents pipeline — the same issue must never appear in both views.
