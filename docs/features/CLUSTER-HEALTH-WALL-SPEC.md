# Cluster Health Wall — Feature Spec v1.0

**Feature:** Cluster Health Wall
**Route:** `/clusters`
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## What This Is

A real-time, horizontally scrollable dashboard showing the health of
all 11 BeLive clusters simultaneously. 3 seconds to know which cluster
needs attention. Click any cluster for full ticket detail and actions.

**Core principle:** Color is the story. Text confirms it.

---

## Business Rules

### Turnaround (Move Out) SLA
- Day 1–3 → 🟢 Normal
- Day 4–6 → 🟡 Warning (auto-reminder trigger)
- Day 7+  → 🔴 Breach (P1 flag)
- SLA is fixed at 7 days

### Move In SLA
- Must close same day as move-in date
- Any open past move-in date → 🔴 immediate flag
- No amber — binary: done same day or overdue

### Maintenance Ticket Status
- **Active** — Lark cluster group mentioned this unit/issue < 6h ago
- **Silent** — No cluster group mention in 24h+ (most dangerous)
- **Overdue** — Past SLA date (always red regardless of activity)
- **Healthy** — Within SLA + recently active

### Cleaning Ticket Status
- Same logic as maintenance

### Cluster Health Score (0–100)
```
Start: 100
-10 per overdue maintenance ticket (max -40)
-15 per turnaround breach (max -30)
-10 per turnaround warning (max -20)
-20 per overdue move-in (max -40)
-10 if cluster silent > 24h
Floor: 0
```

### Cluster Health Status
- 🔴 RED: any breach OR overdue move-in OR cluster silent 24h+
- 🟡 AMBER: turnaround warning OR maintenance 4–7 days OR silent 12h+
- 🟢 GREEN: all within SLA, active team comms

---

## Four Categories Per Cluster

| Category | Icon | Source | Key Metrics |
|----------|------|--------|-------------|
| Maintenance | 🔧 Wrench | AI Report + Lark | Open count, overdue, active, max age |
| Cleaning | 🧹 Sparkles | AI Report + Lark | Open count, overdue, active |
| Move In | 🚪 LogIn | AI Report | Pending count, overdue count |
| Move Out | 🔄 RefreshCw | AI Report | Units in turnaround, warning, breach |

### Ticket Categorization Keywords

**Maintenance:** repair, rosak, leaking, bocor, electric, plumbing,
AC, lift, door, lock, water heater, pipe, ceiling, wall

**Cleaning:** cleaning, clean, housekeeping, dirty, smell, stain,
carpet, mop

**Move In:** move in, move-in, onboarding, handover in, vacant
possession, tenant onboard

**Move Out:** move out, move-out, turnaround, vacate, checkout,
handover out, inspection, vacant

Default: maintenance if unclear

---

## Data Sources

### Primary: AI Report Group
- Chat ID: `oc_a4addada959faf09e220364d4fabae75`
- Format: Master Livability Report messages
- Parsed into: `ai_report_tickets` table
- Future: will read directly from BeLive OS/Spacify

### Activity Detection: Cluster Groups
- Recent messages from `lark_group_messages` table
- Checks if unit number or ticket ID mentioned in last 6h/24h
- Determines Active vs Silent status

---

## Database

### New Table: `cluster_health_cache`
Stores computed health snapshot per cluster. Updated every 15 min
by cron + after new AI report parsed.

```sql
CREATE TABLE cluster_health_cache (
  id uuid default gen_random_uuid() primary key,
  updated_at timestamptz default now(),
  cluster text unique not null,        -- C1 through C11
  cluster_name text not null,          -- Johor Bahru, Penang, etc
  chat_id text not null,               -- Lark group chat_id
  health_status text default 'green',  -- red, amber, green
  health_score int default 100,        -- 0-100

  maintenance_total int default 0,
  maintenance_overdue int default 0,
  maintenance_active int default 0,
  maintenance_silent int default 0,
  maintenance_max_age_days numeric default 0,

  cleaning_total int default 0,
  cleaning_overdue int default 0,
  cleaning_active int default 0,
  cleaning_silent int default 0,
  cleaning_max_age_days numeric default 0,

  move_in_pending int default 0,
  move_in_overdue int default 0,

  turnaround_total int default 0,
  turnaround_warning int default 0,   -- Day 4-6
  turnaround_breach int default 0,    -- Day 7+
  turnaround_max_days numeric default 0,

  last_cluster_message_at timestamptz,
  cluster_silent_hours numeric default 0,
  last_computed_at timestamptz default now()
);
```

Seed all 11 clusters on migration.
Enable realtime on this table.

### Cluster Seeds
```
C1  | Johor Bahru      | oc_d1444b3f367192219a0a60b4dfb7fecb
C2  | Penang           | oc_2592d0368e35fce2a5712c95e446ec17
C3  | Nilai            | oc_8557892a71694977e646d0750286b532
C4  | Ampang           | oc_23f4b9516f13fcdd9d049660bf3c2851
C5  | Ara Damansara    | oc_6d9d83b2c73ab20a168a3cc78de68994
C6  | PJ Subang        | oc_c7c2b5e1a8728f527ca618f5b644c934
C7  | Seri Kembangan   | oc_97eb2eebfc235bd180afceafe5a9c514
C8  | Sentul           | oc_ace6312bfd7317550940ed001f04a92f
C9  | Cheras           | oc_e59ce72f6864572d10d68462d856aad9
C10 | Mont Kiara       | oc_75e4c47ca8e8e1e57a0b39e90d80e105
C11 | M Vertica        | oc_269af941aba2403693dd5dad8a45e832
```

---

## New Types (add to lib/types.ts)

```typescript
export type ClusterHealth = {
  id: string
  updated_at: string
  cluster: string
  cluster_name: string
  chat_id: string
  health_status: 'red' | 'amber' | 'green'
  health_score: number
  maintenance_total: number
  maintenance_overdue: number
  maintenance_active: number
  maintenance_silent: number
  maintenance_max_age_days: number
  cleaning_total: number
  cleaning_overdue: number
  cleaning_active: number
  cleaning_silent: number
  cleaning_max_age_days: number
  move_in_pending: number
  move_in_overdue: number
  turnaround_total: number
  turnaround_warning: number
  turnaround_breach: number
  turnaround_max_days: number
  last_cluster_message_at: string | null
  cluster_silent_hours: number
  last_computed_at: string
}

export type ClusterTicketDetail = {
  ticket_id: string
  unit_number: string | null
  room: string | null
  issue_description: string
  category: 'maintenance' | 'cleaning' | 'move_in' | 'move_out'
  age_days: number
  sla_date: Date | null
  sla_overdue: boolean
  owner_name: string | null
  owner_role: string | null
  activity_status: 'active' | 'silent' | 'overdue' | 'healthy'
  last_activity_at: Date | null
  incident_id: string | null
  summary: string
}
```

---

## New Files to Create

```
lib/cluster-health.ts              ← computation engine
lib/property-cluster-map.ts        ← already built (reuse)

app/(dashboard)/clusters/page.tsx  ← server component
app/api/clusters/route.ts          ← GET all 11 health snapshots
app/api/clusters/[cluster]/route.ts        ← GET single + tickets
app/api/clusters/[cluster]/ask/route.ts    ← POST generate ask msg
app/api/clusters/[cluster]/send/route.ts   ← POST send to Lark
app/api/clusters/compute/route.ts  ← POST trigger recomputation

components/clusters/ClusterHealthWall.tsx  ← main client component
components/clusters/ClusterColumn.tsx      ← single column card
components/clusters/ClusterDetailPanel.tsx ← right panel on click
components/clusters/AskMessageModal.tsx    ← ask message composer
```

---

## lib/cluster-health.ts — Key Functions

### `categorizeTicket(ticket)`
Maps ticket to maintenance / cleaning / move_in / move_out
based on issue_description keywords.

### `getTicketActivityStatus(ticket, recentClusterMessages)`
Returns: active / silent / overdue / healthy
- overdue: sla_overdue = true (always overdue regardless)
- active: unit mentioned in cluster messages < 6h
- silent: no cluster mention in 24h+
- healthy: within SLA + recently active

### `computeClusterHealth(cluster)`
Reads ai_report_tickets + lark_group_messages for cluster.
Computes all counts. Determines health_status and health_score.
Upserts to cluster_health_cache.

### `computeAllClusters()`
Runs computeClusterHealth for all 11 in parallel.

### `getClusterTicketDetails(cluster)`
Returns all open tickets for cluster enriched with activity status.
Sorted: overdue first, then by age_days descending.

### `generateAskMessage(ticket, cluster)`
Calls Claude claude-sonnet-4-6, max_tokens 150.
Generates Manglish message, < 60 words, ends with 🙏.
Tags owner by role. Specific to unit and issue.

---

## UI Layout

### Page: /clusters (no cluster selected)
```
┌──────────────────────────────────────────────────────┐
│ Cluster Health              🔴 3 critical  [↻]       │
├──────────────────────────────────────────────────────┤
│ ◀  ● ● ● ○ ○ ○ ○ ○ ○ ○ ○  ▶  ← navigation dots    │
├──────────┬──────────┬──────────┬──────────┬──────────┤
│   C1     │   C2     │   C3     │   C4     │   ...    │
│  🔴 JB   │  🟢 PG   │  🟡 NL   │  🔴 AMP  │  scroll  │
│  403u    │  239u    │  184u    │  287u    │          │
├──────────┼──────────┼──────────┼──────────┤          │
│ 🔧 12    │ 🔧 3     │ 🔧 8     │ 🔧 15    │          │
│ 🔴 3 OVR │ 🟢 clear │ 🟡 1 SLA │ 🔴 5 OVR │          │
├──────────┼──────────┼──────────┼──────────┤          │
│ 🧹 4     │ 🧹 1     │ 🧹 0     │ 🧹 2     │          │
│ 🟢 ok    │ 🟢 ok    │ 🟢 ok    │ 🟡 1 SLA │          │
├──────────┼──────────┼──────────┼──────────┤          │
│ 🚪 4 pnd │ 🚪 1 pnd │ 🚪 0     │ 🚪 6 pnd │          │
│ 🔴 1 ovr │ 🟢 ok    │ 🟢 ok    │ 🔴 2 ovr │          │
├──────────┼──────────┼──────────┼──────────┤          │
│ 🔄 3 u   │ 🔄 0     │ 🔄 2 u   │ 🔄 5 u   │          │
│ 🔴 D8    │ 🟢 clear │ 🟢 D2    │ 🔴 D8    │          │
│ 🟡 D5    │          │          │ 🟡 D5    │          │
├──────────┼──────────┼──────────┼──────────┤          │
│ 💬 12m   │ 💬 3h    │ 💬 45m   │ 💬 8h ⚠️ │          │
└──────────┴──────────┴──────────┴──────────┴──────────┘
```

Visible: 4 columns at a time on desktop
Scroll: horizontal, snap to column
Mobile: 1 column, swipe
Tablet: 2 columns

### Page: /clusters (C11 selected — split view)
```
┌──────────────────────┬───────────────────────────────┐
│ COLUMNS (45%)        │ C11 — M Vertica         [X]   │
│                      │ Health: 42   🔴               │
│ C1 🔴 [selected]     ├───────────────────────────────┤
│ C2 🟢                │ [🔧 12] [🧹 4] [🚪 2] [🔄 3] │
│ C3 🟡                ├───────────────────────────────┤
│ C4 🔴 ← selected     │ Sort: [Overdue first]          │
│ ...                  │                               │
│                      │ TICKET LIST                   │
│                      │                               │
│                      │ 🔴 BLV-RQ-26004945 16.9d OVR  │
│                      │ Unit B-24-10 Room 1           │
│                      │ Move In — onboarding pending  │
│                      │ [ITS] Danish Ikhwan           │
│                      │ [💬 Ask] [↑ Esc] [✓ Done]    │
│                      │                               │
│                      │ 🔵 BLV-RQ-26005789 1.8d ACT  │
│                      │ Unit D-17-06 Room 1           │
│                      │ Drain leakage bad smell       │
│                      │ [IOE] Mardhiah               │
│                      │ [💬 Ask] [↑ Esc] [✓ Done]    │
└──────────────────────┴───────────────────────────────┘
```

### Turnaround Progress Bar (Move Out tab)
```
🔴 Unit A-12-03
   ████████████████████░░░  Day 8/7
   SLA breached — 1 day overdue
   [OOE] Johan
   [💬 Chase OOE] [↑ P1]

🟡 Unit B-05-11
   ████████████████░░░░░░░  Day 5/7
   2 days remaining — Warning
   [OOE] Johan
   [💬 Remind] [📋 View]
```

### Ask Message Modal
```
┌───────────────────────────────────────┐
│ Send to C11 Group                [X]  │
├───────────────────────────────────────┤
│ Re: BLV-RQ-26004945 · Unit B-24-10   │
│                                       │
│ [editable textarea — AI pre-filled]   │
│ "Danish — unit B-24-10 move-in       │
│  ticket dah 16 hari. Boleh update    │
│  status? Tenant still waiting ke? 🙏" │
│                                       │
│ Sending to: C11 · As: Lee Seng Hee   │
│                                       │
│ [Cancel]     [Send to C11 Group →]   │
└───────────────────────────────────────┘
```

---

## Design System

```
Background:  #080E1C
Surface:     #0D1525
Border:      #1A2035
Primary:     #F2784B
Font body:   DM Sans
Font mono:   JetBrains Mono

Status colors:
  active/in-progress: #4BB8F2 (blue)
  overdue:            #E05252 (red)
  warning:            #E8A838 (amber)
  healthy:            #4BF2A2 (green)
  silent:             #9B6DFF (purple)

Column border glow by health:
  red:   box-shadow 0 0 20px rgba(224,82,82,0.4)
  amber: box-shadow 0 0 12px rgba(232,168,56,0.2)
  green: box-shadow 0 0 8px  rgba(75,242,162,0.1)

Cluster colors:
  C1:#F2784B  C2:#9B6DFF  C3:#4BB8F2  C4:#4BF2A2
  C5:#E8A838  C6:#F27BAD  C7:#6DD5F2  C8:#B46DF2
  C9:#F2C96D  C10:#6DF2B4 C11:#E05252
```

---

## Action Buttons Per Ticket

| Button | Action | Result |
|--------|--------|--------|
| 💬 Ask | Generate AI message → modal → send to cluster group | Creates linked incident |
| ↑ Escalate | Create P1 incident in Command Center | DMs Lee |
| ✓ Resolve | Mark resolved in Nucleus | Removes from list |
| 📋 View | Open linked incident in Command Center | Navigation |

### Ask Message AI Instructions
- Manglish, direct, caring
- Tag owner by role name
- Mention unit + issue specifically
- Ask for status or specific action
- Under 60 words
- End with 🙏
- Model: claude-sonnet-4-6, max_tokens: 150

---

## API Routes

| Method | Route | Purpose |
|--------|-------|---------|
| GET | /api/clusters | All 11 health snapshots |
| GET | /api/clusters/[cluster] | Single cluster + ticket details |
| POST | /api/clusters/[cluster]/ask | Generate ask message for ticket |
| POST | /api/clusters/[cluster]/send | Send message to cluster group |
| POST | /api/clusters/compute | Trigger full recomputation |

---

## Real-time Behavior

- Subscribe to `cluster_health_cache` Supabase realtime
- Column updates live when health recomputed
- Health status color transition: 0.5s smooth
- If column turns RED: border pulses 3x
- Number changes: count-up/down animation

---

## Cron Integration

Every 15 min cron (existing) also calls `computeAllClusters()`.
Triggered after:
- AI report parsed (new tickets)
- Ticket resolved via cluster panel

---

## Sidebar Integration

- Icon: LayoutGrid (lucide)
- Label: Clusters
- Route: /clusters
- Badge: count of RED clusters (red background)
- Position: 3rd in sidebar (after Command)

---

## Morning Overview Integration

Add to app/(dashboard)/page.tsx:
```
Cluster Status
─────────────────────────────────
🔴 C11 M Vertica — 3 overdue, D8 breach
🔴 C1  JB        — 2 overdue maintenance
🟡 C4  Ampang    — D5 turnaround warning
🟢 8 clusters healthy

→ View all clusters
```
Show RED + AMBER only. GREEN shown as count.

---

## Done Criteria

- [ ] /clusters loads 11 columns
- [ ] Horizontal scroll + snap works (desktop + mobile)
- [ ] Column health status colors correct
- [ ] RED columns have glow animation
- [ ] Click column → split view detail panel
- [ ] Four category tabs with ticket counts
- [ ] Ticket cards show correct status colors
- [ ] Turnaround progress bars (Day X/7)
- [ ] 💬 Ask generates Manglish AI message
- [ ] Ask modal opens, editable, sends to Lark
- [ ] Send creates linked incident in Command Center
- [ ] ↑ Escalate creates P1 incident
- [ ] ✓ Resolve removes ticket from list
- [ ] Real-time updates via Supabase subscription
- [ ] Morning overview shows cluster health summary
- [ ] Sidebar shows RED cluster count badge
- [ ] computeAllClusters runs every 15 min via cron
- [ ] Zero TypeScript errors
- [ ] Deployed to production
