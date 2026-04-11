# NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC

**Feature:** Cluster Health — War Room View (`/clusters`)
**Status:** Spec locked, ready for build
**Owner:** Lee (product) / CJ (execution)

---

## 1. Purpose

Replace the current `/clusters` page, which reads like a ticket queue, with a **war-room situation board**. The commander (Lee) must scan 11 clusters × 5 categories and understand *what is actually happening* in 10 seconds — without reading ticket numbers, without clicking, without context-switching.

Every row is a one-line situation report. The AI summary replaces the ticket title. The commander sees the situation; the operator opens detail to act.

---

## 2. Layout

- **Horizontal scroll**, one fixed 440px column per cluster, 11 total. No vertical scroll — strict 1-page height.
- **Cluster pills strip** top-right, natural order `C1 → C11`. Each pill carries a severity dot (worst open in that cluster). Click → smooth-scroll to column + coral flash on header.
- **Column order inside each cluster:** Maintenance (10) → Cleaning (3) → Move In (3) → Move Out (3) → Incidents (3).

**Count rationale:** Maintenance carries the diagnostic weight — volume, variety, and the clearest pattern signal (stack leaks, aircon clusters, electrical). The other four categories only need top 3 to answer "is this cluster's pipeline on fire?" If move-in has 17 open and the top 3 are all P1/overdue, the commander knows to ask Brittany without needing rows 4-5. The `+N more →` link carries the rest.

---

## 3. Row Format — "Situation Report"

Every row is a 2-line card, always fully rendered (no expand-on-click).

**Line 1** (compact, monospace, dim): `severity_dot · SLA_pill · age`
- Severity dot: coral P1, amber P2, slate P3/P4
- SLA pill: always shows *duration*, never bare "OVR"
  - Overdue: filled coral `2h OVR`, `3d OVR`, `12h OVR`
  - Due soon (<24h): hollow amber `4h`, `18h`
  - Otherwise: hidden
- Age: plain dim text `5d`, `3h`

**Line 2** (the context): AI-generated situation summary in plain English, ≤140 chars, owner trailing in dim text.
- Example: *"Leaking incoming pipe at 11-01, flooding risk to units below, tenant reports water pooling — Ali"*
- Owner is always the first name from `staff_directory` resolution.

**No ticket numbers on the main view.** Ticket# surfaces only on hover tooltip and in the detail drawer on click.

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

> Build the Cluster Health war-room view per `docs/features/NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md`: horizontal-scroll 11-column layout with **fixed-band grid** (Maintenance always rows 1–10, Cleaning/MoveIn/MoveOut/Incidents always 3 rows each, empty slots render as dotted placeholders, strict top-N enforcement so no section ever overflows its band). 2-line situation-report rows with always-visible AI summary + trailing owner, P1 coral tinting, `[unclassified]` amber fallback showing raw Lark text, overdue pills with explicit duration (`2h OVR`, `3d OVR`), category headers with `total · N ovr` diagnostics. **Fix the owner resolution bug system-wide: `resolveOwnerName()` must return `— unknown` on failure, never raw `cli_xxx` or `ou_xxx` open_ids.** Add shared `sortClustersNatural()` util and apply across Command Center, Briefings, Watchdog, Mobile PWA, and Learning Engine. Add `ai_summary`, `is_classified`, `raw_lark_text` fields to the incidents table.
