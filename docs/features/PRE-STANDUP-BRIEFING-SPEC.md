# Pre-Standup Briefing System — Feature Spec v1.0

**Feature:** Daily Pre-Standup Briefing + Compliance Tracking
**Embedded into:** Cluster Health Wall (/clusters)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026
**Replaces:** Cowork pre-standup prompt

---

## What This Is

Nucleus generates and sends a daily intelligence brief to all 11
cluster Lark groups at 8:30am MYT (30 min before 9am standup).
After standup, IOE posts a free-text report. Nucleus detects it,
extracts structured data, tracks compliance, and generates an
evening OCC review at 10:15pm.

Everything is embedded in the Cluster Health Wall detail panel
as a new "Daily Log" tab — no new page needed.

---

## The Daily Cycle

```
8:30am → Pre-standup brief sent to all 11 cluster groups (as Lee)
9:00am → Standup begins (human-led, Nucleus monitors)
9:00–11am → IOE posts standup report (free text, Nucleus detects)
10:00am → Reminder sent to clusters with no report yet (gentle nudge)
11:00am → Non-compliant clusters → P2 incident created
12:00pm → Midday scan (internal only, updates Daily Log, no group message)
10:15pm → Evening OCC sent to all 11 cluster groups (as Lee)
```

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Sales data | Option C — read Sales Bookings group chat now, Lark Base later |
| Card format | Same Lark v7 interactive card as Cowork |
| Midday message | Internal only — no group message, updates Daily Log |
| Evening OCC | Sent to cluster group + appears in Daily Log |
| Reminder tone | Gentle nudge — name IOE, mention missing report, 🙏 |
| Non-compliance | P2 incident assigned to: IOE of that cluster + Fatihah |
| Dashboard | No new page — embed Daily Log tab in Cluster Health detail panel |

---

## Data Sources

### New groups to add to monitored_groups

```
Sales Bookings:  oc_f81ecc82a89ffebed07ff3c5025be54d
  group_type: 'sales'
  context: Daily sales report. Read for indoor + outdoor own sales.
           CRITICAL READING RULES:
           - Total = Indoor Sales + Outdoor Own Sales ONLY
           - Indoor numbers ALREADY include virtual sales
           - Never add virtual on top of indoor
           - Outdoor Physical From Viewing = already in indoor, not additional
           - External Agent + Uhomes = tracked only, excluded from total
           agent: 'cfo'

Tenant Viewing:  oc_6f826a841c23872ce8faa8e16f822f6a
  group_type: 'sales'
  context: Daily viewing counts per agent. Secondary sales signal.
  agent: 'cfo'
```

### All sources used for morning brief

| Source | Data Extracted | Already in Nucleus? |
|--------|---------------|---------------------|
| AI Report Group | Open tickets per cluster, age, SLA | ✅ Yes |
| Cluster Groups (C1-C11) | Overnight activity, issues discussed | ✅ Yes |
| OOE Group | Yesterday performance, blockers | ✅ Yes |
| Maint Group | Tech task lists, urgent requests | ✅ Yes |
| IOE Group | Collection rate, renewals, IOE updates | ✅ Yes |
| Sales Bookings | Daily sales report | ➕ Add now |
| Tenant Viewing | Viewing counts | ➕ Add now |

---

## Data Model

### New table: standup_sessions

```sql
CREATE TABLE standup_sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  session_date date not null,
  cluster text not null,
  chat_id text not null,

  -- Morning brief
  brief_sent boolean default false,
  brief_sent_at timestamptz,
  brief_card_json jsonb,        -- the exact card JSON that was sent
  brief_lark_message_id text,   -- Lark message ID of sent card

  -- Standup report compliance
  report_detected boolean default false,
  report_detected_at timestamptz,
  report_raw_content text,      -- IOE's original message
  report_sender_name text,
  report_sender_open_id text,
  report_confidence int,        -- 0-100 confidence this is a standup report
  report_extracted jsonb,       -- AI-extracted structure (see below)

  -- Compliance tracking
  compliance_status text default 'pending',
  -- values: pending, compliant, reminder_sent, non_compliant
  reminder_sent boolean default false,
  reminder_sent_at timestamptz,
  reminder_lark_message_id text,
  incident_id uuid references incidents(id),

  -- Midday scan (internal only)
  midday_scanned boolean default false,
  midday_scanned_at timestamptz,
  midday_summary text,          -- AI summary of midday state
  midday_new_incidents int default 0,
  midday_commitments_on_track boolean,

  -- Evening OCC
  occ_sent boolean default false,
  occ_sent_at timestamptz,
  occ_card_json jsonb,          -- the exact OCC card JSON sent
  occ_lark_message_id text,

  UNIQUE(session_date, cluster)
);
```

### report_extracted JSON structure

```json
{
  "move_in": {
    "count": 2,
    "units": ["12B", "8A"]
  },
  "move_out": {
    "count": 1,
    "units": ["5C"]
  },
  "patrol": {
    "units": ["7B", "9A", "3C"],
    "notes": "complaint-prone units"
  },
  "tech_tasks": [
    "AC repair unit 12B — Faris",
    "Pipe leak unit 8A — Ayad"
  ],
  "risks": [
    "Tenant complaint unit 5A unresolved 3 days",
    "Parts awaited for water heater 11C"
  ],
  "priorities": [
    "Close AC repair before noon",
    "Follow up tenant 5A"
  ],
  "escalations": []
}
```

### New table: daily_messages

```sql
CREATE TABLE daily_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  session_id uuid references standup_sessions(id),
  cluster text not null,
  session_date date not null,
  message_type text not null,
  -- values: pre_standup, standup_report, reminder,
  --         midday_scan, evening_occ

  direction text not null,
  -- values: outbound (Nucleus sent), inbound (team sent)

  content_text text,            -- plain text version
  content_card_json jsonb,      -- card JSON if outbound card
  sender_name text,             -- for inbound: who posted
  lark_message_id text,
  sent_at timestamptz,
  metadata jsonb
);
```

### Updates to cluster_health_cache

```sql
ALTER TABLE cluster_health_cache
  ADD COLUMN IF NOT EXISTS today_compliance text default 'pending',
  -- pending, compliant, reminder_sent, non_compliant
  ADD COLUMN IF NOT EXISTS standup_report_at timestamptz,
  ADD COLUMN IF NOT EXISTS brief_sent_today boolean default false,
  ADD COLUMN IF NOT EXISTS occ_sent_today boolean default false;
```

---

## Morning Brief — Generation Logic

### lib/briefings/pre-standup.ts

#### generateClusterBrief(cluster: string, sessionDate: date): Promise<LarkCardJSON>

**Data gathering (all parallel):**

```
1. Open tickets from ai_report_tickets for this cluster
   → sorted by: overdue first, then age desc
   → categorized: maintenance, cleaning, move_in, move_out

2. OOE group messages from last 24h
   → extract: per-OOE move-in/out/patrol counts
   → extract: blockers mentioned for tomorrow
   → morning report submission rate

3. Maint group messages from last 24h
   → extract: tech daily task lists per technician
   → extract: urgent requests from Fatihah/Fariha

4. IOE group messages from last 24h
   → extract: collection updates
   → extract: renewal status
   → extract: any IOE reports for this cluster

5. Sales Bookings group messages from last 24h
   → extract: daily sales report
   → apply CRITICAL reading rules (see below)
   → map to this cluster by property/ITS name

6. Tenant Viewing group messages from last 24h
   → extract: viewing counts for this cluster

7. Cluster group messages from last 24h
   → extract: overnight incidents, issues discussed
   → detect: any unresolved items carried forward
```

**CRITICAL Sales Reading Rules (must be in AI prompt):**
```
Total Company Sales = Indoor Sales + Outdoor Own Sales ONLY
Indoor numbers ALREADY include virtual sales — never add on top
Outdoor Physical From Viewing = already in indoor, not additional
External Agent + Uhomes = tracked separately, EXCLUDED from total
Per person: show indoor number, note virtual in brackets
Example: "Kit ✅ 2 sales (1 virtual)" NOT "Kit 3 sales"
```

#### generateBriefCard(cluster, data): LarkCardJSON

Generates Lark v7 interactive card. Exact structure:

```json
{
  "schema": "2.0",
  "config": { "wide_screen_mode": true },
  "header": {
    "template": "[cluster_color]",
    "title": {
      "tag": "plain_text",
      "content": "📊 Cluster X — Location | Pre-Standup Brief"
    },
    "subtitle": {
      "tag": "plain_text",
      "content": "DATE (DAY) · N Properties · N Units"
    }
  },
  "elements": [
    // 1. Column set bisect grey: Cell Team | Tickets
    // 2. hr
    // 3. markdown: "## Yesterday Review — DATE"
    // 4. Column set grey: OOE Yesterday (per person + blockers)
    // 5. Column set: Tech Yesterday
    // 6. Column set bisect grey: Indoor Sales | Outdoor Sales
    // 7. markdown: OOE Discipline compliance rate
    // 8. hr
    // 9. markdown: "## Today's Plan — DATE (DAY)"
    // 10. Column set grey: Urgent — Settle First (numbered)
    // 11. Column set: Tech Plan Today
    // 12. hr
    // 13. Column set grey: AI Insights
    // 14. hr
    // 15. note: footer with sources + timestamp
  ]
}
```

**Cluster header colors:**
```
C1=indigo, C2=blue, C3=turquoise, C4=red, C5=green
C6=orange, C7=violet, C8=purple, C9=carmine, C10=wathet, C11=green
```

**Cell Team section shows:**
```
IOE: [name] | OOE: [name] | Tech: [name]
(from belive-context skill PIC matrix)
```

**Tickets section shows:**
```
Total: N | Critical: N | Urgent: N | Normal: N
Maint: N | Clean: N | Move In: N | Move Out: N
ITS: [name] | OOS: [name] | OR: [name]
```

**OOE Yesterday section (per person):**
```
[name]: [emoji] [N] MI · [N] MO · [N] Patrol
Blocker: [if any for this cluster]
```

**Tech Yesterday:**
```
[tech_name]: [N] tasks completed · [N] carried forward
```

**Sales section:**
```
Indoor: [per-agent breakdown, virtual in brackets]
Outdoor Own: [per-agent]
Total: [indoor + outdoor own only]
```

**Urgent section:**
```
Numbered list, max 5 items
Priority: safety → SLA overdue → blockers → stale tickets
```

**AI Insights:**
```
Cross-cluster patterns relevant to this cluster
Lee's tone: direct, actionable, Manglish
Example: "3 clusters with AC issues — check if same contractor.
          C11 ticket SLA breach pattern recurring weekly."
```

#### sendMorningBriefs(): Promise<void>

```
For each cluster (C1-C11):
  1. Call generateClusterBrief()
  2. Call generateBriefCard()
  3. Send card to cluster chat_id using Lee's user token
     POST /im/v1/messages?receive_id_type=chat_id
     Authorization: Bearer {lee_user_token}
     msg_type: 'interactive'
  4. Upsert standup_sessions:
     brief_sent: true
     brief_sent_at: now()
     brief_card_json: the card JSON
     brief_lark_message_id: response message_id
  5. Insert daily_messages:
     message_type: 'pre_standup'
     direction: 'outbound'
  6. Update cluster_health_cache:
     brief_sent_today: true

After all 11 sent:
  Send summary DM to Lee (ou_af2a40628719440234aa29656d06d322):
  "✅ Pre-standup briefs sent to all 11 clusters
   [C1 ✅] [C2 ✅] ... [C11 ✅]
   
   Top 3 company-wide concerns:
   1. [most urgent cross-cluster issue]
   2. [second]
   3. [third]
   
   Sales: [total indoor + outdoor own]"
```

---

## Standup Report Detection

### lib/briefings/standup-detector.ts

#### isStandupReport(message: RawMessage, cluster: string): number (confidence 0-100)

**Detection signals (additive scoring):**

```
+30 — Sender is known IOE for this cluster
      (check against belive-context IOE names per cluster)

+20 — Posted between 9:00am–11:30am MYT

+15 — Contains move-in/move-out keywords:
      "move in", "move out", "MI", "MO", "masuk", "keluar"

+15 — Contains tech/patrol keywords:
      "tech", "patrol", "ticket", "technician", "task"

+10 — Contains risk/priority keywords:
      "risk", "priority", "urgent", "escalate", "pending"

+10 — Message length > 100 characters

+10 — Contains "report", "standup", "daily", "update", "hari ni"

-20 — Sender is OOE or Tech (not IOE)
-30 — Posted before 8:30am or after 12pm
```

**Thresholds:**
```
>= 70 → High confidence standup report → process immediately
40–69 → Medium confidence → process but flag for review
< 40  → Not a standup report → ignore
```

#### extractStandupData(content: string, cluster: string): Promise<ReportExtracted>

Claude claude-sonnet-4-6, max_tokens 500

System prompt:
```
You extract structured data from IOE (Indoor Operation Executive)
standup reports posted in BeLive Property Hub cluster group chats.
IOE is the cell leader — their report covers move-in, move-out,
patrol units, tech tasks, risks, and priorities for the day.

Extract exactly what is mentioned. If a field is not mentioned,
use null or empty array. Do not invent data.

Respond ONLY in valid JSON matching this structure:
{
  "move_in": { "count": number, "units": string[] },
  "move_out": { "count": number, "units": string[] },
  "patrol": { "units": string[], "notes": string | null },
  "tech_tasks": string[],
  "risks": string[],
  "priorities": string[],
  "escalations": string[]
}
```

#### processIncomingClusterMessage(message, group)

Called from webhook handler for every cluster group message.

```
1. Get today's standup_session for this cluster
2. If report_detected already: skip (already have today's report)
3. Check time window: 9am–11:30am MYT only
4. Call isStandupReport() → get confidence score
5. If confidence < 40: return (not a report)
6. Call extractStandupData()
7. Update standup_sessions:
   report_detected: true
   report_detected_at: now()
   report_raw_content: message.content
   report_sender_name: message.sender_name
   report_confidence: confidence
   report_extracted: extracted JSON
   compliance_status: 'compliant'
8. Insert daily_messages:
   message_type: 'standup_report'
   direction: 'inbound'
   content_text: message.content
9. Update cluster_health_cache:
   today_compliance: 'compliant'
   standup_report_at: now()
10. If confidence 40–69: create low-priority incident
    "Possible standup report detected — please verify"
```

---

## Compliance Enforcement

### lib/briefings/compliance.ts

#### checkAndRemindNonCompliant(): Promise<void>

Runs at 10:00am MYT via cron.

```
For each cluster:
  Get today's standup_session
  If compliance_status = 'pending' AND brief_sent = true:
    Get IOE name for this cluster (from belive-context)
    Generate reminder message:
      "[IOE name] — standup report belum masuk.
       Boleh post bila free? 🙏"
    Send to cluster chat_id (as bot, not as Lee —
      gentle reminder, not CEO instruction)
    Update standup_sessions:
      reminder_sent: true
      reminder_sent_at: now()
      compliance_status: 'reminder_sent'
    Insert daily_messages:
      message_type: 'reminder'
      direction: 'outbound'
    Update cluster_health_cache:
      today_compliance: 'reminder_sent'
```

#### createNonComplianceIncidents(): Promise<void>

Runs at 11:00am MYT via cron.

```
For each cluster:
  Get today's standup_session
  If compliance_status IN ('pending', 'reminder_sent'):
    Get IOE name + open_id for this cluster
    Create P2 incident:
      title: 'Standup report not submitted — [Cluster] [date]'
      agent: 'ceo'
      priority: 'P2'
      severity: 'YELLOW'
      incident_type: 'proactive'
      ai_proposal: Generate message as Lee:
        "[IOE name] — C[N] standup report still missing as of 11am.
         This is a compliance issue. Please post immediately.
         Fatihah — please follow up."
      ticket_owner_name: '[IOE name] + Fatihah'
      status: 'awaiting_lee'
    Update standup_sessions:
      compliance_status: 'non_compliant'
      incident_id: created incident id
    Update cluster_health_cache:
      today_compliance: 'non_compliant'
```

---

## Midday Scan (Internal Only)

### lib/briefings/midday.ts

#### runMiddayScan(cluster: string): Promise<void>

Runs at 12:00pm MYT via cron. No message sent to group.

```
1. Read cluster group messages since 8:30am
2. Read standup_sessions for today
3. Call Claude to generate midday assessment:
   - What was committed this morning?
   - Is it being executed? (look for mentions in group)
   - New incidents since 9am?
   - Any blockers emerged?
   - Is anything slipping?

4. Update standup_sessions:
   midday_scanned: true
   midday_scanned_at: now()
   midday_summary: AI assessment text
   midday_new_incidents: count
   midday_commitments_on_track: boolean

5. Insert daily_messages:
   message_type: 'midday_scan'
   direction: 'outbound'  (internal — shown in Daily Log only)
   content_text: midday assessment

6. If commitments_on_track = false:
   Create low-priority incident for Lee's awareness
```

---

## Evening OCC Review

### lib/briefings/evening-occ.ts

#### generateOCCCard(cluster: string): Promise<LarkCardJSON>

```
Data gathering:
1. Today's standup_session (what was committed)
2. Cluster group messages since 9am (what happened)
3. Open incidents for this cluster (what's still unresolved)
4. ai_report_tickets status (did any tickets close today?)

Generate OCC text using Claude (50/50 rule):

FIRST HALF — Praise specific behaviors:
- Name the person, name the behavior
- Reference actual evidence from messages
- "Airen posted standup report at 9:32am sharp"
- "Faris cleared 5 tickets — prioritized habitability not easy jobs"
- "Johan completed 3 MO turnarounds within SLA"

SECOND HALF — Question gaps with root cause thinking:
- Question the system, not the individual
- Reference actual evidence
- "C11 had 8 open tickets at 9am. 6 still open at 10pm.
   Was the tech plan too ambitious? Or were there blockers
   nobody escalated? Who approved this task list?"
- Never direct blame — always root cause

Vary the structure every night.
Never feel like a template.

Build into Lark v7 interactive card:
Header: "🌙 Cluster X — OCC Nightly Review"
Template color: same as morning brief for this cluster
Sections:
1. Today's Commitments vs Delivery (table view)
2. Praise (first half)
3. Questions (second half)
4. Tomorrow's Watchlist (top 3)
Footer: timestamp + sources
```

#### sendEveningOCCs(): Promise<void>

```
For each cluster (C1-C11):
  1. Generate OCC card
  2. Send to cluster chat_id as Lee (user token)
  3. Update standup_sessions:
     occ_sent: true
     occ_sent_at: now()
     occ_card_json: card JSON
  4. Insert daily_messages:
     message_type: 'evening_occ'
     direction: 'outbound'
  5. Update cluster_health_cache:
     occ_sent_today: true

After all 11 sent:
  Send cross-cluster OCC summary DM to Lee:
  - Overall compliance rate today (N/11 submitted)
  - Top performer clusters
  - Problem clusters
  - Tickets closed today vs yesterday
  - Tomorrow's top concerns
```

---

## Daily Log Tab — UI Design

### In ClusterDetailPanel.tsx

Add new tab: "📋 Daily Log" as the 5th tab.

```
[🔧 Maint] [🧹 Clean] [🚪 Move In] [🔄 Move Out] [📋 Daily Log]
```

Tab badge: shows today's compliance status icon:
✅ compliant | ⏳ pending | ❌ non-compliant

### Daily Log Content

Chronological timeline — most recent at top:

```
┌────────────────────────────────────────────────────┐
│ 📋 Daily Log — Saturday, 5 Apr 2026               │
│ [← Yesterday]  [Today]  [Tomorrow →]              │
├────────────────────────────────────────────────────┤
│                                                    │
│ 10:15pm — Evening OCC                  OUTBOUND ↑  │
│ ┌──────────────────────────────────────────────┐   │
│ │ 🌙 OCC Nightly Review — C11 M Vertica        │   │
│ │ [Praise section collapsed]          [Expand] │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ 12:00pm — Midday Scan              INTERNAL 🔍     │
│ ┌──────────────────────────────────────────────┐   │
│ │ 2 new incidents since morning                │   │
│ │ Commitments: mostly on track                 │   │
│ │ Faris AC repair — in progress ✅             │   │
│ │ Patrol units — pending ⏳                   │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ 9:32am — IOE Standup Report         INBOUND ↓     │
│ Airen · Confidence: 94%                           │
│ ┌──────────────────────────────────────────────┐   │
│ │ RAW MESSAGE:                                 │   │
│ │ "Daily report C11: MI 2 units (12B, 8A).    │   │
│ │  MO 1 unit (5C). Patrol: 7B,9A. Tech: Faris │   │
│ │  AC 12B, Ayad pipe 8A. Risk: tenant 5A 3    │   │
│ │  hari belum settle."                         │   │
│ ├──────────────────────────────────────────────┤   │
│ │ AI EXTRACTED:                                │   │
│ │ Move In: 2 (12B, 8A)                        │   │
│ │ Move Out: 1 (5C)                            │   │
│ │ Patrol: 7B, 9A                              │   │
│ │ Tech: AC 12B (Faris), Pipe 8A (Ayad)        │   │
│ │ Risk: Unit 5A — 3 days unresolved           │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
│ 8:30am — Pre-Standup Brief          OUTBOUND ↑    │
│ ┌──────────────────────────────────────────────┐   │
│ │ 📊 C11 — M Vertica | Pre-Standup Brief       │   │
│ │ [Card preview — collapsed]          [Expand] │   │
│ └──────────────────────────────────────────────┘   │
│                                                    │
└────────────────────────────────────────────────────┘
```

### Message Type Styling

```
OUTBOUND (Nucleus sent):
  Left border: #F2784B (coral)
  Header: "[time] — [type]   OUTBOUND ↑"
  Background: slightly warmer than surface
  Expandable card preview

INBOUND (team sent):
  Left border: #4BB8F2 (blue)
  Header: "[time] — [sender]   INBOUND ↓"
  Background: slightly cooler than surface
  Shows raw message + AI extracted side by side

INTERNAL (midday scan):
  Left border: #9B6DFF (purple)
  Header: "[time] — [type]   INTERNAL 🔍"
  Background: muted purple tint
  Shows AI assessment only
```

### Date Navigation

```
[← Yesterday] [Today] [Tomorrow →]
```
- Default: today
- ← navigates to previous day (loads that day's standup_sessions)
- Tomorrow: disabled (no future data)

### Expandable Card Preview

For outbound cards (morning brief + evening OCC):
- Collapsed: shows card title + first 2 lines of content
- Expand button: shows full card rendered as formatted text
- NOT rendering the actual Lark card JSON — render as clean readable text

---

## Cluster Column — Compliance Indicator

Update ClusterColumn.tsx — add at bottom of column:

```
CURRENT BOTTOM:
  💬 Last: 12m ago

NEW BOTTOM:
  💬 Last: 12m ago
  📋 9:32am ✅ IOE report    ← if compliant
  OR
  📋 ⏳ Reminder sent 10am   ← if pending after reminder
  OR
  📋 ❌ No report — incident  ← if non-compliant
```

Color coding:
- ✅ green text
- ⏳ amber text
- ❌ red text, subtle pulse

---

## API Routes

### New routes

```
GET  /api/briefings/today
  Returns standup_sessions for all 11 clusters for today
  Includes compliance_status, report_detected, brief_sent

GET  /api/briefings/[cluster]/[date]
  Returns single cluster's session for a date
  Includes all daily_messages for that cluster+date

GET  /api/briefings/[cluster]/[date]/messages
  Returns chronological daily_messages for cluster+date

POST /api/briefings/send-morning
  Triggers sendMorningBriefs() immediately
  Protected by NUCLEUS_SECRET header
  Used for manual trigger + testing

POST /api/briefings/send-evening
  Triggers sendEveningOCCs() immediately
  Protected by NUCLEUS_SECRET header

POST /api/briefings/check-compliance
  Triggers checkAndRemindNonCompliant()
  Protected by NUCLEUS_SECRET header

POST /api/briefings/create-incidents
  Triggers createNonComplianceIncidents()
  Protected by NUCLEUS_SECRET header
```

---

## Cron Schedule Updates

Update vercel.json:

```json
{
  "crons": [
    { "path": "/api/cron/morning",     "schedule": "30 0 * * 1-6" },
    { "path": "/api/cron/compliance",  "schedule": "0 2 * * 1-6" },
    { "path": "/api/cron/incidents",   "schedule": "0 3 * * 1-6" },
    { "path": "/api/cron/midday",      "schedule": "0 4 * * 1-6" },
    { "path": "/api/cron/escalate",    "schedule": "0 * * * *"   },
    { "path": "/api/cron/evening",     "schedule": "15 14 * * 1-6" }
  ]
}
```

MYT = UTC+8:
- 00:30 UTC = 8:30am MYT → morning brief
- 02:00 UTC = 10:00am MYT → compliance reminder
- 03:00 UTC = 11:00am MYT → non-compliance incidents
- 04:00 UTC = 12:00pm MYT → midday scan
- 14:15 UTC = 10:15pm MYT → evening OCC

### New cron routes

```
app/api/cron/morning/route.ts   → sendMorningBriefs()
app/api/cron/compliance/route.ts → checkAndRemindNonCompliant()
app/api/cron/incidents/route.ts  → createNonComplianceIncidents()
app/api/cron/midday/route.ts    → runMiddayScan() for all clusters
app/api/cron/evening/route.ts   → sendEveningOCCs()
```

---

## Files to Create

```
lib/briefings/pre-standup.ts     ← morning brief generator
lib/briefings/standup-detector.ts ← IOE report detection + extraction
lib/briefings/compliance.ts      ← reminder + incident creation
lib/briefings/midday.ts          ← midday scan (internal)
lib/briefings/evening-occ.ts     ← OCC card generator

app/api/briefings/route.ts
app/api/briefings/[cluster]/route.ts
app/api/briefings/[cluster]/[date]/route.ts
app/api/briefings/send-morning/route.ts
app/api/briefings/send-evening/route.ts
app/api/briefings/check-compliance/route.ts
app/api/briefings/create-incidents/route.ts

app/api/cron/morning/route.ts
app/api/cron/compliance/route.ts
app/api/cron/incidents/route.ts
app/api/cron/midday/route.ts
app/api/cron/evening/route.ts
```

## Files to Update

```
components/clusters/ClusterColumn.tsx
  → Add compliance indicator at bottom

components/clusters/ClusterDetailPanel.tsx
  → Add Daily Log as 5th tab
  → Build DailyLogTab component inside

lib/lark-groups.ts (or scanner.ts)
  → After saving group message: call processIncomingClusterMessage()
  → Detect standup reports in real-time via webhook

monitored_groups table
  → Add Sales Bookings group
  → Add Tenant Viewing group

cluster_health_cache table
  → Add compliance columns

vercel.json
  → Update cron schedule

app/api/events/lark/route.ts
  → Route cluster group messages through standup detector
```

---

## IOE Name → Cluster Mapping

Used for compliance reminder targeting.
Source: belive-context skill (PIC matrix).

```
C1  → IOE: Nureen
C2  → IOE: Intan
C3  → IOE: Aireen
C4  → IOE: Aliya + Nureen
C5  → IOE: Aliya (KIV)
C6  → IOE: Intan (KIV)
C7  → IOE: Mardhiah + Aireen
C8  → IOE: Mardhiah
C9  → IOE: Intan + Aliya
C10 → IOE: Nureen + Aliya
C11 → IOE: Airen + Mardhiah
```

Non-compliance incident always CC: Fatihah (OM)

---

## Testing Plan

### Step 1 — Database
```
supabase db reset && supabase db push
Verify: standup_sessions table exists
Verify: daily_messages table exists
Verify: cluster_health_cache has new compliance columns
Verify: Sales Bookings + Tenant Viewing in monitored_groups
```

### Step 2 — Morning brief generation
```
# Test single cluster brief generation
curl -X POST http://localhost:3000/api/briefings/send-morning \
  -H "x-nucleus-secret: belive_nucleus_2026" \
  -d '{"clusters": ["C11"]}'  ← test with C11 only first

Check: standup_sessions row created
Check: daily_messages row created (type: pre_standup)
Check: message received in Nucleus Testing Group
       oc_585301f0077f09015428801da0cba90d
```

### Step 3 — Standup report detection
```
# Send a test standup report to Testing Group
# Then run scan to trigger detection

Simulate IOE report (post in testing group):
"Daily report C11: MI 2 units (12B, 8A). MO 1 unit.
 Patrol: 7B. Tech: Faris AC 12B. Risk: tenant 5A belum settle."

Run scan → check standup_sessions updated
Check confidence score
Check extracted JSON
```

### Step 4 — Daily Log UI
```
Open /clusters
Click C11 column
Click Daily Log tab
Verify: morning brief appears as outbound
Verify: standup report appears as inbound with raw + extracted
Verify: compliance indicator shows ✅ in column
```

### Step 5 — Compliance enforcement
```
# Test reminder (simulate no report by 10am)
curl -X POST http://localhost:3000/api/briefings/check-compliance \
  -H "x-nucleus-secret: belive_nucleus_2026"

Check: reminder sent to testing group
Check: standup_sessions compliance_status = 'reminder_sent'
Check: cluster column shows ⏳

# Test non-compliance incident
curl -X POST http://localhost:3000/api/briefings/create-incidents \
  -H "x-nucleus-secret: belive_nucleus_2026"

Check: P2 incident created in Command Center
Check: assigned to IOE + Fatihah
Check: cluster column shows ❌
```

### Step 6 — Evening OCC
```
curl -X POST http://localhost:3000/api/briefings/send-evening \
  -H "x-nucleus-secret: belive_nucleus_2026" \
  -d '{"clusters": ["C11"]}'

Check: OCC card received in testing group
Check: daily_messages row created (type: evening_occ)
Check: Daily Log tab shows evening OCC entry
```

---

## Done Criteria

- [ ] standup_sessions table created with all columns
- [ ] daily_messages table created
- [ ] Sales Bookings + Tenant Viewing added to monitored_groups
- [ ] Morning brief generates for all 11 clusters
- [ ] Morning brief uses Lark v7 interactive card format
- [ ] Morning brief sent as Lee (user token)
- [ ] Sales data read correctly (no double-counting)
- [ ] standup_sessions created after brief sent
- [ ] IOE standup report detected from free text (webhook)
- [ ] Confidence scoring works (>70 = auto-process)
- [ ] Report data extracted into structured JSON
- [ ] Compliance reminder sent at 10am if no report
- [ ] Reminder is gentle Manglish nudge to IOE by name
- [ ] P2 incident created at 11am if still no report
- [ ] Incident assigned to cluster IOE + Fatihah
- [ ] Midday scan runs at 12pm (internal, no group message)
- [ ] Evening OCC sent at 10:15pm (50/50 praise/question)
- [ ] Daily Log tab appears in Cluster detail panel
- [ ] Daily Log shows chronological timeline (morning/report/midday/evening)
- [ ] Card previews are expandable
- [ ] Date navigation works (yesterday/today)
- [ ] Cluster column shows compliance indicator (✅/⏳/❌)
- [ ] All tested against Nucleus Testing Group first
- [ ] Zero TypeScript errors
- [ ] Deployed to production
