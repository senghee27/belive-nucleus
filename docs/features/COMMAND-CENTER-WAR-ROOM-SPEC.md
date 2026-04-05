# Command Center Redesign — War Room Spec v1.0

**Feature:** Command Center Redesign
**Routes:** /command (table) + /command/[id] (detail page)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

A general in a war room doesn't read cards.
They scan a situation board.

```
War room table:  optimized for SCANNING (density + speed)
Detail page:     optimized for DECISION (space + action)

These are two different cognitive modes.
They deserve two different views.

Table → identify the problem in 3 seconds
Detail → understand + act in 23 seconds
```

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| View modes | Toggle: Flat Table / Grouped by Status |
| Timestamps | Both: issue created + last updated in table |
| Detail view | Dedicated page /command/[id] |
| Columns | 11 columns including 2 timestamps |
| Mobile | Desktop only for now |
| Category assignment | AI default + Lee can override |

---

## Part 1 — The War Room Table (/command)

### Page Layout

```
┌─────────────────────────────────────────────────────────────────────┐
│ Command Center                      ● LIVE        Lee Seng Hee      │
├─────────────────────────────────────────────────────────────────────┤
│ STAT PILLS                                                          │
│ [🔴 7 New] [⚡ 5 Awaiting Lee] [🔵 8 Acting] [✅ 12 Today]         │
├─────────────────────────────────────────────────────────────────────┤
│ FILTER BAR (row 1 — severity + cluster)                             │
│ [All] [🔴 RED] [🟡 YELLOW] [🟢 GREEN]  │  [All Clusters]           │
│ [C1] [C2] [C3] [C4] [C5] [C6] [C7] [C8] [C9] [C10] [C11]         │
├─────────────────────────────────────────────────────────────────────┤
│ FILTER BAR (row 2 — category + priority + status)                   │
│ [All] [🌬️ AC] [💧 Leak] [⚡ Elec] [🚪 MI] [📦 MO] [🧹 Clean]     │
│ [🔨 Repair] [🔑 Access] [🚨 Safety] [More ▾]                        │
│ [P1] [P2] [P3]  │  [New] [Awaiting] [Acting] [Silent] [Resolved]   │
├─────────────────────────────────────────────────────────────────────┤
│ TOOLBAR                                                             │
│ 47 incidents  [🔍 Search...]  [Table ⇄ Grouped]  [Sort ▾]          │
├─────────────────────────────────────────────────────────────────────┤
│ TABLE                                                               │
│ [see table design below]                                            │
└─────────────────────────────────────────────────────────────────────┘
```

---

### The Table Columns (11)

```
Col  Width   Header          Content
───  ──────  ──────────────  ──────────────────────────────────────
1    24px    ● (severity)    Colored dot, pulsing if P1
2    52px    Cluster         C1–C11 colored badge
3    90px    Unit            Unit number in JetBrains Mono
4    28px    Cat             Category icon (no text)
5    220px   Issue           Title, 40 chars max, ellipsis
6    64px    Owner           First name only
7    52px    Priority        P1/P2/P3 badge
8    72px    Status          new/acting/silent/awaiting badge
9    90px    Created         "3d ago" or "Apr 2, 9:14am"
10   90px    Last Update     "12m ago" or "Apr 5, 10:07am"
11   32px    →               Row action arrow (open detail)
```

Total visible row height: **36px**
20+ incidents visible without scrolling on standard screen.

---

### Table Row Design

```
┌──┬──────┬──────────┬────┬────────────────────────────────┬──────┬────┬────────┬──────────┬──────────┬──┐
│● │Clust │Unit      │Cat │Issue                           │Owner │Pri │Status  │Created   │Updated   │→ │
├──┼──────┼──────────┼────┼────────────────────────────────┼──────┼────┼────────┼──────────┼──────────┼──┤
│🔴│ C11  │B-24-10   │🌬️ │AC not working — Day 3          │Airen │ P1 │SILENT  │3d ago    │3d ago    │→ │
│🔴│ C1   │Lvl 3     │💧 │Pipe burst flooding corridor    │Faris │ P1 │ACTING  │6h ago    │12m ago   │→ │
│🟡│ C6   │AZR-13A-15│🧹 │Cleaning complaint              │David │ P2 │NEW     │7h ago    │7h ago    │→ │
│🟡│ C5   │A-13-03   │🔑 │Cloned access cards x3 tenants  │Johan │ P2 │NEW     │2h ago    │2h ago    │→ │
│🟡│ C11  │C-48-06   │💧 │Sink leak + lamp rail fallen    │Faris │ P3 │NEW     │2h ago    │45m ago   │→ │
│🟢│ C1   │—         │🔨 │White cap replacement done      │Faris │ P3 │ACTING  │7h ago    │1h ago    │→ │
└──┴──────┴──────────┴────┴────────────────────────────────┴──────┴────┴────────┴──────────┴──────────┴──┘
```

**Row states:**
- Default: bg #0D1525
- Hover: bg #111D30, cursor pointer
- Selected/active: left border 2px #F2784B, bg #110E0A

**Severity dot:**
- P1 RED: #E05252, animate-pulse
- P2 YELLOW: #E8A838, static
- P3 GREEN: #4BF2A2, static
- Dot size: 8px circle

**Cluster badge:**
- Colored per cluster (C1:#F2784B etc)
- 40px wide pill, center-aligned
- Font: JetBrains Mono, 11px, bold

**Unit column:**
- JetBrains Mono, 12px
- Muted if no unit number (—)

**Category icon:**
- 16px emoji or lucide icon
- Tooltip on hover: full category name

**Issue title:**
- DM Sans, 13px, #E8EEF8
- Single line, 40 char truncation
- Full text in tooltip on hover

**Owner:**
- First name only
- If unassigned: "—" muted

**Priority badge:**
- P1: bg #E05252/20, text #E05252
- P2: bg #E8A838/20, text #E8A838
- P3: bg #4B5A7A/20, text #4B5A7A

**Status badge:**
- new: bg #E05252/15, text #E05252, "NEW"
- awaiting_lee: bg #E8A838/15, text #E8A838, "⚡ LEE"
- acting: bg #4BB8F2/15, text #4BB8F2, "ACTING"
- silent: bg #9B6DFF/15, text #9B6DFF, "SILENT"
- resolved: bg #4BF2A2/15, text #4BF2A2, "DONE"

**Timestamps:**
- "3d ago" format for > 24h
- "6h ago" for > 1h
- "45m ago" for < 1h
- "just now" for < 2m
- Tooltip: exact datetime on hover
- Color: normal if recent, amber if > 24h, red if > 72h
- Created and Last Update use same formatting

**SILENT rows:**
- Entire row: purple-tinted background rgba(155,109,255,0.06)
- Status badge pulses slowly

**→ arrow column:**
- Appears on row hover
- Click → navigate to /command/[id]
- Keyboard: Enter key on focused row

---

### Column Sorting

Click any column header to sort:
- Severity (default): P1 RED first, then age
- Created: newest or oldest first
- Last Update: most recently updated first
- Cluster: alphabetical
- Status: new → awaiting_lee → acting → silent

Active sort: header shows ↑↓ indicator

---

### Filter Bar Behavior

**Severity filters:**
- [All] [🔴 RED] [🟡 YELLOW] [🟢 GREEN]
- Multi-select: click multiple to combine (OR logic)
- Active: filled background, white text

**Cluster filters:**
- [All Clusters] pill
- Then C1–C11 individual pills
- Colored per cluster
- Multi-select allowed

**Category filters:**
```
🌬️ Air Con        💧 Plumbing/Leak   ⚡ Electrical
🚪 Move In         📦 Move Out        🧹 Cleaning
🔨 Repair          🔑 Access          🚨 Safety
🛗 Lift            🌡️ Water Heater    More ▾
```
- [More ▾] expands to show all categories
- Multi-select allowed

**Priority filters:**
- [P1] [P2] [P3] — multi-select

**Status filters:**
- [New] [Awaiting Lee] [Acting] [Silent] [Resolved]
- Resolved hidden by default, click to show

**Search:**
- Searches: unit number, issue title, owner name, ticket ID
- Real-time filtering as you type
- Clears with × button

**Active filters:**
- Show as removable pills below filter bar
- "C11 × | AC × | P1 ×" — click × to remove
- [Clear all] button

---

### View Toggle: Table ⇄ Grouped

**Grouped by Status view:**

```
🔴 NEW  ·  3 incidents
─────────────────────────────────────────────────
[row] [row] [row]

⚡ AWAITING LEE  ·  5 incidents  ← act now
─────────────────────────────────────────────────
[row] [row] [row] [row] [row]

🔵 ACTING  ·  8 incidents
─────────────────────────────────────────────────
[row] [row] [row] [row] ...

🔇 SILENT  ·  4 incidents  ← danger zone
─────────────────────────────────────────────────
[row] [row] [row] [row]

✅ RESOLVED TODAY  ·  12 incidents
─────────────────────────────────────────────────
[collapsed — click to expand]
```

- Each group header: status color, count badge
- AWAITING LEE: amber border, "act now" label
- SILENT: purple tint, "danger zone" label
- Resolved: collapsed by default, expand on click
- Same columns as flat table
- Rows sorted by created_at within each group

**Toggle button:**
- [≡ Table] [⊞ Grouped]
- Selected: filled background
- Persists in localStorage per user

---

### Realtime Behavior

Subscribe to incidents table changes:
- New incident: flash row coral for 2s, scroll into view if P1
- Status change: row moves to new group (grouped view)
- P1 new: toast notification top-right "🚨 P1 — C11 Pipe burst"
- Update to last_updated: timestamp refreshes in cell

---

## Part 2 — Issue Category System

### Category taxonomy

```typescript
export const ISSUE_CATEGORIES = {
  // Maintenance
  air_con:        { label: 'Air Con',          icon: '🌬️', color: '#4BB8F2' },
  plumbing:       { label: 'Plumbing / Leak',  icon: '💧', color: '#4BB8F2' },
  electrical:     { label: 'Electrical',       icon: '⚡', color: '#E8A838' },
  lift:           { label: 'Lift',             icon: '🛗', color: '#9B6DFF' },
  door_lock:      { label: 'Door / Lock',      icon: '🚪', color: '#4B5A7A' },
  water_heater:   { label: 'Water Heater',     icon: '🌡️', color: '#F2784B' },
  general_repair: { label: 'General Repair',   icon: '🔨', color: '#4B5A7A' },
  structural:     { label: 'Structural',       icon: '🧱', color: '#E05252' },
  pest:           { label: 'Pest',             icon: '🦟', color: '#E8A838' },

  // Cleaning
  cleaning:       { label: 'Cleaning',         icon: '🧹', color: '#4BF2A2' },
  hygiene:        { label: 'Hygiene / Waste',  icon: '🗑️', color: '#4BF2A2' },

  // Tenancy
  move_in:        { label: 'Move In',          icon: '🚶', color: '#4BF2A2' },
  move_out:       { label: 'Move Out',         icon: '📦', color: '#E8A838' },
  access_card:    { label: 'Access Card',      icon: '🔑', color: '#9B6DFF' },
  onboarding:     { label: 'Onboarding',       icon: '📋', color: '#4BB8F2' },

  // Compliance
  safety:         { label: 'Safety Issue',     icon: '🚨', color: '#E05252' },
  eviction:       { label: 'Eviction',         icon: '⚖️', color: '#E05252' },
  payment:        { label: 'Payment',          icon: '💰', color: '#E8A838' },

  // Other
  complaint:      { label: 'Complaint',        icon: '📣', color: '#F27BAD' },
  other:          { label: 'Other',            icon: '❓', color: '#4B5A7A' },
}
```

### AI classification prompt addition

Add to classifyMessage() in lib/incidents.ts:

```
Also classify into one of these categories:
air_con, plumbing, electrical, lift, door_lock, water_heater,
general_repair, structural, pest, cleaning, hygiene,
move_in, move_out, access_card, onboarding, safety, eviction,
payment, complaint, other

Keywords:
- air_con: AC, aircond, air-con, sejuk, panas, cooling
- plumbing: bocor, leaking, pipe, water, flood, sink, toilet, drain
- electrical: electric, trip, power, light, switch, socket
- lift: lift, elevator
- door_lock: door, lock, kunci, pintu, access
- water_heater: water heater, pemanas, shower
- move_in: move in, masuk, onboard, handover in
- move_out: move out, keluar, vacate, turnaround, checkout
- access_card: access card, kad, clone, cloned
- safety: safety, bahaya, dangerous, emergency, flood, fire
- cleaning: cleaning, clean, kotor, dirty, smell, bau
- complaint: complaint, complain, aduan, tenant complaint
```

Add column to incidents table:
```sql
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS category text default 'other';
```

---

## Part 3 — The Detail Page (/command/[id])

### Page Layout — Full Screen

```
┌─────────────────────────────────────────────────────────────────────┐
│ ← Back to Command                        ● LIVE    Lee Seng Hee    │
├─────────────────────────────────────────────────────────────────────┤
│ INCIDENT HEADER (full width)                                        │
│ ● RED  C11  P1  COO  SILENT  SLA                                    │
│ Pipe burst Unit 11-01 EPIC — Level 3 flooding                       │
│ Detected 6h ago · Last update 12m ago · Source: C1 cluster group   │
│ [🔗 View in Lark] [↑ Escalate] [✓ Resolve] [🗄 Archive]            │
├──────────────────────────────────────┬──────────────────────────────┤
│                                      │                              │
│  THREAD (60%)                        │  INTELLIGENCE (40%)         │
│                                      │                              │
│  [vertical timeline]                 │  [AI Summary]               │
│                                      │  [Proposed Action]          │
│                                      │  [Send as Lee]              │
│                                      │  [Ticket Reference]         │
│                                      │                              │
└──────────────────────────────────────┴──────────────────────────────┘
```

### Incident Header Section

```
┌─────────────────────────────────────────────────────────────────────┐
│ ● RED    C1    P1    COO    [SILENT]    [SLA OVERDUE]               │
│                                                                     │
│ Pipe burst Unit 11-01 EPIC — Level 3 corridor flooding             │
│                                                                     │
│ 🕐 Detected: Apr 5, 9:14am (6h ago)                               │
│ 🔄 Last update: Apr 5, 3:02pm (12m ago)                           │
│ 📍 Source: C1 — Johor Bahru cluster group                         │
│ 🎫 Ticket: BLV-RQ-26004945 · 16.9 days · [IOE] Danish             │
│                                                                     │
│ [🔗 View in Lark]  [↑ Escalate]  [✓ Resolve]  [🗄 Archive]        │
└─────────────────────────────────────────────────────────────────────┘
```

**View in Lark deeplink:**
```typescript
// Lark deeplink to original message
const larkDeepLink =
  `https://applink.larksuite.com/client/message/open` +
  `?messageId=${incident.source_lark_message_id}`

// Opens Lark app to the exact message
// Works on desktop (opens in Lark desktop app)
// Works on mobile (opens Lark mobile)
```

Show as: `🔗 View in Lark` button
- Opens in new tab
- Lark intercepts and opens the message in context
- If message not found: show "Source message unavailable"

### Thread Column (60%) — Same as INCIDENT-DETAIL-PANEL-SPEC

Full vertical timeline.
Chronological, oldest at top.
Real names from staff_directory.
Lark profile photos.
@mention resolution.
Silence gap indicators.
Copy button per message.
Realtime subscription.

See INCIDENT-DETAIL-PANEL-SPEC.md for full thread design.

### Intelligence Column (40%)

**Section 1: AI Summary**
```
▼ AI Summary                                    [↻ Regenerate]
──────────────────────────────────────────────────────────────
"Pipe burst in Unit 11-01 EPIC causing flooding in Level 3
 corridor. Contractor called but not yet on site. Lift
 inaccessible. No update from team in 45 minutes. Fariha
 following up."

Generated: 3:02pm · Based on 8 thread messages
```
Collapsible. Default: expanded.

**Section 2: Proposed Action**
```
Proposed Action                           Confidence: 91%
──────────────────────────────────────────────────────────
┌────────────────────────────────────────────────────────┐
│ Fariha — isolate water supply to Unit 11-01           │
│ immediately. Ayad must be on site within 30 min.      │
│ Notify all affected tenants on Level 3 personally.    │
│ If repair cost > RM5,000 call me first.               │
│                                                        │
│ Johan — prepare temporary accommodation if            │
│ flooding continues past 5pm.                          │
└────────────────────────────────────────────────────────┘

[✏️ Edit]
```
Full text always visible, never truncated.
Edit makes textarea editable.

**Section 3: Send as Lee**
```
Send as Lee                         Reply in thread ✓
──────────────────────────────────────────────────────
Replying to: Fariha · "Pipe burst unit 11-01..."
Sending to: C1 group · as Lee Seng Hee

┌────────────────────────────────────────────────────┐
│ Type additional instruction...                     │
└────────────────────────────────────────────────────┘
                                            0 / 500

Mentioning: (detected automatically)

[✅ Approve & Send Proposed]  [📨 Send Custom]
```

**Section 4: Ticket Reference** (if ticket_id present)
```
Ticket Reference
──────────────────────────────────────────────────────
BLV-RQ-26004945  ·  16.9 days old
SLA: 29 Mar 2026  ·  ⚠️ OVERDUE 7 days
Owner: [IOE] Danish Ikhwan
Issue: Move In — Tenant onboarding pending

[🔗 View ticket in AI Report]
```

**Section 5: Actions (sticky bottom)**
```
──────────────────────────────────────────────────────
[✓ Resolve]    [↑ Escalate]    [🗄 Archive]
```

---

## Part 4 — Navigation

### From table to detail page

```
Click row → navigate to /command/[incident.id]
URL: https://belive-nucleus.vercel.app/command/abc-123-def

Back button: ← Back to Command
  → returns to /command
  → restores previous filter state (saved in sessionStorage)
  → scrolls to the row that was selected
```

### Filter state persistence

```typescript
// Before navigating to detail page
sessionStorage.setItem('command_filters', JSON.stringify({
  severity: selectedSeverity,
  clusters: selectedClusters,
  categories: selectedCategories,
  status: selectedStatus,
  search: searchQuery,
  sort: sortConfig,
  view: viewMode,  // table or grouped
  scrollPosition: window.scrollY
}))

// On returning to /command
// Restore all filters + scroll position
```

### Keyboard navigation

- Arrow keys: navigate rows up/down
- Enter: open detail page for focused row
- Escape: close any open filter dropdowns
- /: focus search input
- T: toggle table/grouped view

---

## Part 5 — New Database Columns

### Migration: add_command_center_columns

```sql
-- Add category to incidents
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS category text default 'other';

-- Add index for category filtering
CREATE INDEX IF NOT EXISTS idx_incidents_category
  ON incidents(category);

-- Add index for created_at + status combined queries
CREATE INDEX IF NOT EXISTS idx_incidents_status_created
  ON incidents(status, created_at DESC);

-- Ensure last_activity column exists (may already exist as updated_at)
-- This is the "last update" shown in the table
-- Use updated_at from existing schema
```

No new tables needed. All data already exists.
Just adding the category column + indexes.

---

## Part 6 — New/Updated Files

### New files

```
app/(dashboard)/command/[id]/page.tsx     ← detail page (server component)
app/(dashboard)/command/[id]/IncidentPage.tsx ← client component

components/command/WarRoomTable.tsx        ← flat table view
components/command/GroupedView.tsx         ← grouped by status view
components/command/FilterBar.tsx           ← all filters
components/command/IncidentRow.tsx         ← single table row
components/command/CategoryBadge.tsx       ← category icon + tooltip
components/command/IncidentPageHeader.tsx  ← full incident header
components/command/LarkDeepLink.tsx        ← "View in Lark" button
```

### Updated files

```
app/(dashboard)/command/page.tsx          ← replace with table view
components/command/CommandCenter.tsx      ← simplified (delegates to table)
lib/incidents.ts                          ← add category to classifyMessage
app/api/incidents/route.ts                ← add category filter param
supabase migration                        ← add category column + indexes
```

---

## Part 7 — API Updates

### Update: GET /api/incidents

Add new query params:
```
category: string (air_con, plumbing, etc.)
created_after: ISO date string
created_before: ISO date string
updated_after: ISO date string
sort: 'severity' | 'created' | 'updated' | 'cluster'
order: 'asc' | 'desc'
```

Response: add `category` field to each incident.

### New: GET /api/incidents/[id]

```
Returns full incident including:
- All timeline entries (ordered by created_at)
- Lark deeplink URL computed server-side
- Ticket reference if ticket_id present
- Staff info for sender_open_id
```

---

## Lark Deeplink Format

```typescript
function getLarkDeepLink(messageId: string): string {
  // Format 1: Direct message link (preferred)
  return `https://applink.larksuite.com/client/message/open?messageId=${messageId}`
}

// In IncidentPageHeader component:
<a
  href={getLarkDeepLink(incident.source_lark_message_id)}
  target="_blank"
  rel="noopener noreferrer"
  className="lark-deeplink-btn"
>
  🔗 View in Lark
</a>
```

Shows tooltip: "Opens original message in Lark"
If source_lark_message_id is null: button disabled, tooltip "Source message unavailable"

---

## Testing Plan

### Step 1 — Migration
```
supabase db reset && supabase db push
Verify: incidents.category column exists
Verify: indexes created
```

### Step 2 — Table view
```
Open /command
Verify: table renders with all 11 columns
Verify: rows are 36px height (compact)
Verify: P1 severity dot is pulsing
Verify: SILENT rows have purple tint
Verify: timestamps show correctly ("3d ago", "12m ago")
Verify: timestamp tooltip shows exact datetime
```

### Step 3 — Filters
```
Click [🔴 RED] → only red incidents show
Click [C11] → only C11 incidents
Click [🌬️ AC] → only air con incidents
Click [P1] → only P1
Combine filters → correct AND logic
Search "pipe" → shows pipe-related incidents
Clear all → all incidents visible
```

### Step 4 — Toggle
```
Click [⊞ Grouped]
Verify: groups by status with section headers
Verify: RESOLVED collapsed by default
Verify: click RESOLVED header → expands
Click [≡ Table] → back to flat table
Verify: filters persist across toggle
```

### Step 5 — Navigation
```
Click row → navigates to /command/[id]
Verify: full page loads with incident header
Verify: thread column shows with timeline design
Verify: intelligence column shows proposed action
Verify: ← Back returns to table
Verify: filters + scroll position restored
```

### Step 6 — Lark deeplink
```
Click [🔗 View in Lark] on an incident with source_message_id
Verify: link opens in new tab
Verify: Lark opens to that message
Test incident without source_message_id → button disabled
```

### Step 7 — Category display
```
Trigger a scan → new incident created
Open /command → verify category icon shows in Cat column
Click category filter [💧 Leak] → incident appears
```

### Step 8 — Realtime
```
Trigger scan from Settings
Verify: new incidents appear in table without refresh
P1 incident: verify toast notification appears
```

### Step 9 — Keyboard navigation
```
Press / → search focused
Press arrow keys → rows highlight
Press Enter → detail page opens
Press Escape → clears focus
```

---

## Done Criteria

- [ ] incidents.category column added with AI classification
- [ ] /command shows compact table (11 columns, 36px rows)
- [ ] Severity dots: P1 pulsing, P2/P3 static
- [ ] SILENT rows have purple tint background
- [ ] Timestamps: created + last updated with relative format
- [ ] Timestamp tooltip shows exact datetime on hover
- [ ] Filter bar: severity, cluster, category, priority, status
- [ ] Multi-select filters work (combine with OR per group)
- [ ] Search filters by unit, issue, owner, ticket ID
- [ ] Active filters shown as removable pills
- [ ] Toggle between Table and Grouped view works
- [ ] Grouped view: sections by status, resolved collapsed
- [ ] Column header sorting works (severity, created, updated)
- [ ] Row click navigates to /command/[id]
- [ ] Filter state + scroll position restored on back navigation
- [ ] /command/[id] is full screen (not a panel)
- [ ] Incident header shows all metadata + badges
- [ ] [🔗 View in Lark] deeplink opens correct message
- [ ] Thread column: vertical timeline design (from INCIDENT-DETAIL-PANEL-SPEC)
- [ ] Intelligence column: AI summary + proposed action + send
- [ ] Proposed action full text, never truncated
- [ ] Keyboard navigation (arrows, enter, /)
- [ ] Realtime: new incidents flash + P1 toast
- [ ] Category icons show in table + tooltip on hover
- [ ] Category filter works for all 20 categories
- [ ] Zero TypeScript errors
- [ ] Deployed to production
