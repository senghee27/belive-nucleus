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
**Line 1:** severity dot · SLA pill (`2h OVR`, `3d OVR`, `12h`) · age · human-written ticket title · owner
- Source: operational ticketing tables
- Ranking: **overdue first, then age descending within each SLA bucket**
- The human title is shown as-is (trusted)
- **AI summary available on hover tooltip** — the AI interpretation is one hover away but does not override the human's words by default. Matches the transparency-before-autonomy philosophy.
- Ticket# visible on hover and in detail drawer, never on the main row

### 3.2 Command Mode Row
**Line 1 (compact, monospace dim):** severity dot · SLA pill · age
**Line 2 (the context):** AI-generated situation summary, ≤140 chars, owner trailing in dim text
- Source: Lark connector + classification pipeline
- Ranking: severity → recency, filtered to `attention_required = true` only
- **AI summary always visible** — load-bearing here because raw Lark text is messy
- `[unclassified]` amber fallback renders first 80 chars of raw Lark text when classification hasn't completed yet
- Row height: 2-line cards at ~54px. Because Command mode has only one band, the taller rows fit comfortably in the vertical budget.

### 3.3 Why Asymmetric Treatment

Tickets have human-written titles from the ops system — the AI's marginal value is "clean up shorthand and add context," nice but not load-bearing. Hover is a fair cost. Incidents come from raw Lark chat where the AI is doing the load-bearing work of turning "aircond tak sejuk dah 3 hari" into a diagnosed situation. Each data source gets the treatment matching how much the AI is actually contributing.

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

> Restructure `/clusters` into a two-mode war-room per `docs/features/NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md`: segmented toggle `[Tickets] [Command]` top-left, preserving scroll position and selected cluster on mode change. **Tickets mode** — 4 bands (Maintenance top 10, Cleaning/MoveIn/MoveOut top 3 each), 1-line rows showing human ticket title + SLA/age/owner, sorted by overdue-first then age-desc, AI summary on hover tooltip. **Command mode** — single Incidents band filtered to `attention_required = true` from the Reasoning Trace, 2-line rows with always-visible AI summary, `[unclassified]` amber raw-Lark fallback, sorted severity→recency. Fixed-band grid with dotted placeholder slots, strict top-N enforcement. Cluster pill severity dots recompute per mode. Fix `resolveOwnerName()` to return `— unknown` on failure system-wide, never raw `cli_xxx`/`ou_xxx`. Apply `sortClustersNatural()` system-wide across Command Center, Briefings, Watchdog, Mobile PWA, Learning Engine. Add `ai_summary`, `is_classified`, `raw_lark_text` fields to incidents. **Critical data-source separation:** Tickets mode reads only from operational ticketing tables, Command mode reads only from the incidents/Lark classification pipeline — the same issue must never appear in both views.
