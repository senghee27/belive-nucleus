# Briefings & Reports — Feature Spec v1.0

**Feature:** Briefings & Reports Command Centre
**Route:** /briefings
**Sidebar:** Dedicated icon (FileText or Newspaper icon, between Watchdog and Settings)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

```
Nucleus generates every report.
Lee reviews every report.
Lee approves, edits, or discards.
Over time, Lee builds confidence.
When confident — flip the toggle.
Report sends automatically forever after.

Nothing goes out blind.
Nothing happens in a black box.
Every report has a visible generation log.
```

The newspaper editor model:
- Nucleus is the journalist
- Lee is the editor
- Lark is the printing press
- /briefings is the editorial desk

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Page location | /briefings — dedicated page + sidebar icon |
| Editor | Simple textarea (TipTap in v2) |
| Auto-send gate | Confidence meter shown + manual override always available |
| History retention | All time |
| Send destinations | Sensible defaults pre-selected, Lee can uncheck |

---

## Report Types

### Daily Operational

```
MORNING_BRIEF
  Name: Morning Intelligence Briefing
  Schedule: 08:30am MYT Mon–Sat
  Audience: AI Report group + Lee DM
  Sources: AI Report tickets, all 11 cluster groups, Sales Base
  Icon: 🌅

MIDDAY_PULSE
  Name: Midday Pulse
  Schedule: 12:30pm MYT Mon–Sat
  Audience: Lee DM only
  Sources: Incident queue, cluster health cache
  Icon: ☀️

EOD_SUMMARY
  Name: End of Day Summary
  Schedule: 06:30pm MYT Mon–Sat
  Audience: Lee DM only
  Sources: All incidents, resolution rate, sales, compliance
  Icon: 🌙
```

### Cluster-Level

```
STANDUP_BRIEF
  Name: Pre-Standup Brief (per cluster)
  Schedule: 08:00am MYT Mon–Sat × 11 clusters
  Audience: Respective cluster group
  Sources: That cluster's group messages, incidents, sales
  Icon: 📋

COMPLIANCE_ALERT
  Name: Compliance Alert
  Schedule: On trigger (no standup report by 10:00am)
  Audience: Respective cluster group + Lee DM
  Sources: standup_sessions table
  Icon: ⚠️
```

### Management

```
WEEKLY_OPS
  Name: Weekly Operations Review
  Schedule: Monday 09:00am MYT
  Audience: Lee DM (future: Eason, Keith, CJ)
  Sources: 7-day incident history, sales, compliance rates
  Icon: 📊

MONTHLY_REPORT
  Name: Monthly Performance Report
  Schedule: 1st of each month 09:00am
  Audience: Lee DM
  Sources: Full month data across all clusters
  Icon: 📅

OWNER_SATISFACTION
  Name: Owner Satisfaction Summary
  Schedule: Every Monday 10:00am
  Audience: Lee DM
  Sources: Owner-related incidents, resolution rates, SLA data
  Icon: 🏠
```

### On-Demand

```
CLUSTER_SNAPSHOT
  Name: Cluster Snapshot
  Schedule: Manual trigger (per cluster)
  Audience: Configurable
  Sources: That cluster's full data
  Icon: 🔍

INCIDENT_SUMMARY
  Name: Incident Summary Report
  Schedule: Manual trigger
  Audience: Configurable
  Sources: Filtered incident data
  Icon: ⚡

SALES_SNAPSHOT
  Name: Sales Performance Snapshot
  Schedule: Manual trigger
  Audience: Configurable
  Sources: Lark Base records
  Icon: 💰
```

---

## Database

### New table: briefing_reports

```sql
CREATE TABLE briefing_reports (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Identity
  report_type text not null,
  -- MORNING_BRIEF, MIDDAY_PULSE, EOD_SUMMARY, STANDUP_BRIEF,
  -- COMPLIANCE_ALERT, WEEKLY_OPS, MONTHLY_REPORT,
  -- OWNER_SATISFACTION, CLUSTER_SNAPSHOT, INCIDENT_SUMMARY,
  -- SALES_SNAPSHOT

  report_name text not null,
  cluster text,              -- C1-C11 or null for system-wide reports
  scheduled_for timestamptz, -- when it was supposed to generate/send
  generated_at timestamptz,  -- when Nucleus actually generated it

  -- Content
  content text not null,           -- the full report text (editable)
  content_original text not null,  -- AI-generated original (immutable)
  -- content_original preserved so Lee can always "Reset to original"

  -- Generation metadata (the generation log)
  generation_log jsonb default '{}',
  -- {
  --   sources_read: [{ name, scanned_at, record_count, success }],
  --   ai_reasoning: "string",
  --   processing_start: timestamptz,
  --   processing_end: timestamptz,
  --   duration_seconds: number,
  --   tokens_used: number,
  --   model: string,
  --   errors: []
  -- }

  -- Send destinations
  destinations jsonb not null default '[]',
  -- [{ chat_id, name, type, selected: true/false }]
  -- type: cluster_group | function_group | lee_dm | ai_report

  -- Status lifecycle
  status text not null default 'draft',
  -- draft → pending_review → approved → sent | failed | discarded

  -- Lee actions
  lee_edited boolean default false,    -- did Lee change the content?
  lee_approved_at timestamptz,
  sent_at timestamptz,
  sent_to jsonb,                       -- which destinations actually sent
  send_error text,

  -- Auto-send tracking
  was_auto_sent boolean default false
);
```

Add indexes:
```sql
CREATE INDEX idx_briefing_reports_type_created
  ON briefing_reports(report_type, created_at DESC);

CREATE INDEX idx_briefing_reports_status
  ON briefing_reports(status, created_at DESC);

CREATE INDEX idx_briefing_reports_cluster
  ON briefing_reports(cluster, created_at DESC)
  WHERE cluster IS NOT NULL;

CREATE INDEX idx_briefing_reports_scheduled
  ON briefing_reports(scheduled_for DESC);
```

Enable realtime on briefing_reports.

### New table: briefing_autosend_config

```sql
CREATE TABLE briefing_autosend_config (
  id uuid default gen_random_uuid() primary key,
  updated_at timestamptz default now(),

  report_type text not null unique,
  auto_send_enabled boolean default false,

  -- Confidence tracking
  consecutive_approvals int default 0,
  total_approvals int default 0,
  total_reviews int default 0,
  approval_rate int default 0,           -- 0-100
  last_approved_at timestamptz,
  last_sent_at timestamptz,

  -- Gate thresholds (configurable)
  required_consecutive_approvals int default 10,
  -- auto-send eligible once this threshold is met
  -- Lee can override anytime regardless

  -- Unlock status
  auto_send_eligible boolean default false
  -- true when consecutive_approvals >= required_consecutive_approvals
);
```

Seed with one row per report type, all auto_send_enabled = false.

```sql
INSERT INTO briefing_autosend_config (report_type) VALUES
('MORNING_BRIEF'), ('MIDDAY_PULSE'), ('EOD_SUMMARY'),
('STANDUP_BRIEF'), ('COMPLIANCE_ALERT'), ('WEEKLY_OPS'),
('MONTHLY_REPORT'), ('OWNER_SATISFACTION'),
('CLUSTER_SNAPSHOT'), ('INCIDENT_SUMMARY'), ('SALES_SNAPSHOT');
```

---

## lib/briefings/report-generator.ts

Core generation function used by all report types.

```typescript
import { supabaseAdmin } from '../supabase'

export interface GenerationResult {
  content: string
  generation_log: GenerationLog
  destinations: Destination[]
}

export interface GenerationLog {
  sources_read: SourceRead[]
  ai_reasoning: string
  processing_start: string
  processing_end: string
  duration_seconds: number
  tokens_used: number
  model: string
  errors: string[]
}

// Creates a report record in briefing_reports
// Returns the created report id
export async function generateReport(params: {
  report_type: string
  report_name: string
  cluster?: string
  scheduled_for: Date
  content: string
  generation_log: GenerationLog
  destinations: Destination[]
}): Promise<string> {
  const { data } = await supabaseAdmin
    .from('briefing_reports')
    .insert({
      ...params,
      content_original: params.content,
      status: 'draft',
      generated_at: new Date().toISOString()
    })
    .select('id')
    .single()

  // Check auto-send config
  const { data: config } = await supabaseAdmin
    .from('briefing_autosend_config')
    .select('auto_send_enabled')
    .eq('report_type', params.report_type)
    .single()

  if (config?.auto_send_enabled) {
    // Auto-send: skip review, send immediately
    await sendReport(data!.id, true)
  }

  return data!.id
}

// Send a report to its selected destinations
export async function sendReport(
  reportId: string,
  wasAutoSent = false
): Promise<void> {
  const { data: report } = await supabaseAdmin
    .from('briefing_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (!report) throw new Error('Report not found')

  const destinations = report.destinations.filter(
    (d: Destination) => d.selected
  )

  const sendResults: { chat_id: string; success: boolean; error?: string }[] = []

  for (const dest of destinations) {
    try {
      await sendLarkMessage(dest.chat_id, report.content)
      sendResults.push({ chat_id: dest.chat_id, success: true })
    } catch (err: any) {
      sendResults.push({ chat_id: dest.chat_id, success: false, error: err.message })
    }
  }

  const allSuccess = sendResults.every(r => r.success)

  await supabaseAdmin
    .from('briefing_reports')
    .update({
      status: allSuccess ? 'sent' : 'failed',
      sent_at: new Date().toISOString(),
      sent_to: sendResults,
      send_error: allSuccess ? null : 'One or more destinations failed',
      was_auto_sent: wasAutoSent,
      lee_approved_at: wasAutoSent ? null : new Date().toISOString()
    })
    .eq('id', reportId)

  // Update auto-send confidence tracking
  await updateConfidenceTracking(report.report_type, true)
}
```

---

## API Routes

### app/api/briefings/route.ts

```
GET — List reports
  Params:
    report_type: filter by type
    status: filter by status (draft, pending_review, approved, sent, failed, discarded)
    cluster: filter by cluster
    date_from: ISO date
    date_to: ISO date
    limit: default 50
    cursor: for pagination

  Returns:
    { reports: [...], total: number, next_cursor: string }

POST — Generate on-demand report
  Body: { report_type, cluster? }
  Triggers generation for that type immediately
  Returns: { report_id }
```

### app/api/briefings/[id]/route.ts

```
GET — Fetch single report with full generation log
PATCH — Update report content (Lee editing)
  Body: { content: string }
  Sets lee_edited = true
DELETE — Discard a report (sets status = discarded)
```

### app/api/briefings/[id]/send/route.ts

```
POST — Send a report
  Body: { destinations?: string[] }  // override default destinations
  If destinations provided: updates destinations before sending
  Returns: { sent_to: [...], success: boolean }
```

### app/api/briefings/[id]/reset/route.ts

```
POST — Reset content to original AI-generated version
  Sets content = content_original
  Sets lee_edited = false
  Returns: { ok: true }
```

### app/api/briefings/send-batch/route.ts

```
POST — Send multiple reports at once
  Body: { report_ids: string[] }
  Sends each in sequence
  Returns: { results: [{ id, success, error? }] }
```

### app/api/briefings/autosend/route.ts

```
GET — Get all auto-send configs with confidence data
PATCH — Update auto-send toggle for a report type
  Body: { report_type, auto_send_enabled: boolean }
  Returns: { ok: true }
```

---

## Update Existing Briefing Generators

All existing cron/generation functions should be updated to use
generateReport() instead of directly sending to Lark.

### lib/briefings/pre-standup.ts

```typescript
// BEFORE (sends directly):
await sendLarkMessage(chatId, briefContent)

// AFTER (creates report for review):
await generateReport({
  report_type: 'STANDUP_BRIEF',
  report_name: `Pre-Standup Brief — ${clusterName}`,
  cluster: clusterId,
  scheduled_for: scheduledTime,
  content: briefContent,
  generation_log: log,
  destinations: [
    { chat_id: clusterChatId, name: clusterName, type: 'cluster_group', selected: true },
    { chat_id: LEE_CHAT_ID, name: 'Lee DM', type: 'lee_dm', selected: false }
  ]
})
```

Do the same for morning brief, midday pulse, EOD summary.

---

## The /briefings Page UI

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Briefings & Reports                    ● LIVE    Lee Seng Hee   │
├─────────────────────────────────────────────────────────────────┤
│ STATS ROW                                                       │
│                                                                 │
│ [4 Draft] [2 Pending] [18 Sent Today] [1 Failed]               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ACTION BAR                                                      │
│                                                                 │
│ [☐ Select All]  [📤 Send Selected (0)]  [📤 Send All Drafts]   │
│                              [⚙️ Auto-Send Settings]            │
├─────────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                      │
│                                                                 │
│ Type: [All][🌅 Morning][☀️ Midday][🌙 EOD][📋 Standup]         │
│       [📊 Management][🔍 On-Demand]                             │
│                                                                 │
│ Status: [All][Draft][Pending][Sent][Failed]                     │
│ Cluster: [All][C1][C2]...[C11]                                  │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ REPORT FEED                                                     │
│                                                                 │
│ Today — Monday, 6 Apr 2026                                      │
│ ──────────────────────────────────────────────────────────────  │
│ ☐ 08:30  🌅 Morning Intelligence Briefing    DRAFT  [Edit][▶]  │
│ ☐ 08:00  📋 C11 Pre-Standup Brief           DRAFT  [Edit][▶]  │
│ ☐ 08:00  📋 C9  Pre-Standup Brief           DRAFT  [Edit][▶]  │
│ ☐ 08:00  📋 C4  Pre-Standup Brief           FAILED [Retry]     │
│ ✓ 08:00  📋 C1  Pre-Standup Brief           SENT ✓             │
│ ✓ 08:00  📋 C2  Pre-Standup Brief           SENT ✓             │
│ ...                                                             │
│                                                                 │
│ Yesterday — Sunday, 5 Apr 2026                                  │
│ ──────────────────────────────────────────────────────────────  │
│ ✓ 06:30  🌙 End of Day Summary              SENT ✓  [View]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Report Row Design

```
Each row:
  ☐  [time]  [type icon]  [report name]  [cluster badge?]  [status pill]  [actions]

Status pills:
  DRAFT:    amber background, "Draft" text
  SENT ✓:   green background, "Sent" text
  FAILED ✗: red background, "Failed" text
  DISCARDED: muted, strikethrough

Action buttons per row:
  Draft:   [✏️ Edit]  [▶ Send]
  Failed:  [↺ Retry]
  Sent:    [👁 View]
  All:     [⋯ More] → discard / view generation log

Lee-edited indicator:
  If lee_edited = true → small ✏️ badge on the row
  "Lee edited this report before sending"

Auto-sent indicator:
  If was_auto_sent = true → small ⚡ badge
  "Sent automatically"
```

---

## Report Detail Page (click any row)

Route: /briefings/[id]

```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to Briefings                                             │
│                                                                 │
│ 🌅 Morning Intelligence Briefing                                │
│ Monday, 6 Apr 2026 · 08:30am · Generated in 47s               │
│ Status: DRAFT                                                   │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ SEND TO                                                         │
│                                                                 │
│ ☑ AI Report Group     (oc_a4addada...)                          │
│ ☑ Lee DM              (ou_af2a406...)                           │
│ ☐ All Cluster Groups  (11 groups)                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ REPORT CONTENT                         [✏️ Edit] [↩ Reset]      │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ 📊 BeLive Morning Intelligence Brief — Mon 6 Apr 2026       │ │
│ │                                                             │ │
│ │ 🔴 CRITICAL (3 items)                                       │ │
│ │ • C11: Inter-floor leak BLV-RQ-26000514 — 87 days          │ │
│ │ • C1: Common area tiles — 95 days SLA breach               │ │
│ │ • C4: Lift failure — owner escalation risk                  │ │
│ │                                                             │ │
│ │ 📈 SALES yesterday                                          │ │
│ │ Total: 9 (Indoor 7 + OO 2)                                  │ │
│ │ Kit ✅ 3 · Airen ✅ 2 · Johan ✅ 2 (OO)                    │ │
│ │                                                             │ │
│ │ [content continues...]                                      │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│ ✏️ Lee edited this report (original preserved · Reset available)│
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ GENERATION LOG                                    [▼ Collapse]  │
│                                                                 │
│ DATA SOURCES                                                    │
│ ✓ AI Report group        scanned 08:25am · 847 tickets         │
│ ✓ C1–C11 cluster groups  11/11 scanned                         │
│ ✓ Tenant Sales Base      synced 08:25am · 234 records          │
│ ✗ Viewing Base           not connected                          │
│                                                                 │
│ AI REASONING                                                    │
│ "Identified 3 critical items based on SLA breach threshold     │
│  (>60 days) and owner escalation signals. Sales from Lark      │
│  Base — Indoor includes 3 virtual. C5 compliance flag raised   │
│  — no standup report received in 42 days."                     │
│                                                                 │
│ PROCESSING                                                      │
│ Started: 08:29:01 · Finished: 08:29:47 · 46 seconds           │
│ Tokens: 2,847 · Model: claude-sonnet-4-6                       │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ ACTIONS (sticky footer)                                         │
│                                                                 │
│ [▶ Send Now]  [✏️ Edit]  [🗑️ Discard]                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Edit Mode

When Lee clicks [✏️ Edit]:
- Content area becomes a textarea (full height, dark background)
- Textarea pre-filled with current content
- Character count shown below
- [Save Changes] and [Cancel] buttons appear
- On save: updates content, sets lee_edited = true
- Reset button appears: "↩ Reset to AI original"

---

## Auto-Send Settings Panel

Slide-in drawer from right, triggered by [⚙️ Auto-Send Settings]

```
┌──────────────────────────────────────────────────────┐
│ Auto-Send Settings                          [X close] │
├──────────────────────────────────────────────────────┤
│ Once a report type is sent consistently, you can     │
│ enable auto-send. Nucleus will generate and send     │
│ without waiting for your review.                     │
│                                                      │
│ You can toggle auto-send off at any time.            │
├──────────────────────────────────────────────────────┤
│                                                      │
│ 🌅 Morning Brief                                     │
│ Confidence: ░░░░░░░░░░  3/10 approvals              │
│ Auto-send: [OFF ▶]                                   │
│ Not yet eligible — 7 more approvals needed           │
│                                                      │
│ ────────────────────────────────────────────────     │
│                                                      │
│ 📋 Pre-Standup Brief (per cluster)                   │
│ Confidence: ████████░░  8/10 approvals              │
│ Auto-send: [OFF ▶]  ← eligible, Lee hasn't toggled  │
│ Eligible! Toggle on when ready.                      │
│                                                      │
│ ────────────────────────────────────────────────     │
│                                                      │
│ ☀️ Midday Pulse                                      │
│ Confidence: ██████████  10/10 approvals ✓           │
│ Auto-send: [● ON]  ← active                         │
│ Sending automatically since 3 Apr 2026               │
│                                                      │
│ ────────────────────────────────────────────────     │
│                                                      │
│ 🌙 EOD Summary                                       │
│ Confidence: ░░░░░░░░░░  0/10 approvals              │
│ Auto-send: [OFF ▶]                                   │
│                                                      │
│ 📊 Weekly Ops Review                                 │
│ Confidence: ██░░░░░░░░  2/10 approvals              │
│ Auto-send: [OFF ▶]                                   │
│                                                      │
└──────────────────────────────────────────────────────┘
```

Confidence meter colors:
- 0-4: muted gray fill
- 5-8: amber fill
- 9+: coral fill
- 10+: green fill (eligible)
- Active auto-send: green background on toggle

Toggle behavior:
- If eligible: tap → confirm dialog → enable
- If not eligible: can still force-enable with warning:
  "You have only 3 approvals. Enable anyway?" [Yes] [Cancel]
- If active: tap → immediate disable, no confirm needed

---

## Confidence Tracking Logic

After Lee sends (approves) a report manually:
```typescript
async function updateConfidenceTracking(
  reportType: string,
  approved: boolean
): Promise<void> {
  const { data: config } = await supabaseAdmin
    .from('briefing_autosend_config')
    .select('*')
    .eq('report_type', reportType)
    .single()

  if (!config) return

  const newConsecutive = approved
    ? config.consecutive_approvals + 1
    : 0  // reset on discard

  const newTotal = config.total_approvals + (approved ? 1 : 0)
  const newReviews = config.total_reviews + 1
  const newRate = Math.round((newTotal / newReviews) * 100)
  const nowEligible = newConsecutive >= config.required_consecutive_approvals

  await supabaseAdmin
    .from('briefing_autosend_config')
    .update({
      consecutive_approvals: newConsecutive,
      total_approvals: newTotal,
      total_reviews: newReviews,
      approval_rate: newRate,
      auto_send_eligible: nowEligible,
      last_approved_at: approved ? new Date().toISOString() : config.last_approved_at
    })
    .eq('report_type', reportType)
}
```

When Lee discards a report: consecutive_approvals resets to 0.
Consecutive streak only counts unbroken approvals.

---

## Files to Create

```
app/(dashboard)/briefings/page.tsx           ← report feed page
app/(dashboard)/briefings/[id]/page.tsx      ← report detail page

components/briefings/ReportFeed.tsx          ← main feed list
components/briefings/ReportRow.tsx           ← single row in feed
components/briefings/ReportDetail.tsx        ← detail view
components/briefings/ReportEditor.tsx        ← textarea edit mode
components/briefings/GenerationLog.tsx       ← collapsible log panel
components/briefings/SendDestinations.tsx    ← destination checkboxes
components/briefings/AutoSendDrawer.tsx      ← settings panel
components/briefings/ConfidenceMeter.tsx     ← progress bar per type
components/briefings/StatsRow.tsx            ← draft/pending/sent counts
components/briefings/BatchActionBar.tsx      ← select all + send selected

lib/briefings/report-generator.ts           ← core generation + send
lib/briefings/confidence.ts                 ← tracking logic

app/api/briefings/route.ts                  ← GET list, POST generate
app/api/briefings/[id]/route.ts             ← GET, PATCH, DELETE
app/api/briefings/[id]/send/route.ts        ← POST send
app/api/briefings/[id]/reset/route.ts       ← POST reset to original
app/api/briefings/send-batch/route.ts       ← POST send multiple
app/api/briefings/autosend/route.ts         ← GET configs, PATCH toggle
```

## Files to Update

```
lib/briefings/pre-standup.ts               ← use generateReport()
lib/briefings/morning-brief.ts             ← use generateReport()
lib/briefings/compliance.ts                ← use generateReport()
components/layout/Sidebar.tsx              ← add Briefings icon
```

---

## Sidebar Integration

Add between Watchdog and Settings:

```typescript
{
  icon: FileText,           // from lucide-react
  label: 'Briefings',
  route: '/briefings',
  badge: draftCount,        // amber badge showing draft count
  badgeColor: 'amber'
}
```

Badge shows count of reports in `draft` status.
Clears when all drafts are sent or discarded.

---

## Realtime Behavior

Subscribe to briefing_reports on /briefings page:

```typescript
supabase
  .channel('briefings')
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'briefing_reports'
  }, (payload) => {
    // New report generated → flash new row, increment draft badge
    // Report sent → update status pill in feed
    // Report failed → show error state, red badge
  })
  .subscribe()
```

New report arrives: flash row with amber highlight (same pattern as
Command Center incident flash).

---

## Testing Plan

### Step 1 — Migration
```
supabase db push
Verify: briefing_reports table created
Verify: briefing_autosend_config seeded with 11 rows
```

### Step 2 — Generate a test report
```bash
curl -X POST http://localhost:3000/api/briefings \
  -H "x-nucleus-secret: belive_nucleus_2026" \
  -H "Content-Type: application/json" \
  -d '{"report_type": "MORNING_BRIEF"}'
```
Verify: row created in briefing_reports with status = draft
Verify: content is populated, generation_log has sources

### Step 3 — View in /briefings
Open localhost:3000/briefings
Verify: report appears in feed with DRAFT status
Verify: correct time, type icon, report name shown

### Step 4 — Edit and send
Click [✏️ Edit] on draft report
Edit the content
Click [Save Changes]
Click [▶ Send Now]
Verify: status updates to SENT ✓
Verify: lee_edited = true in database
Verify: sent_to populated with destination results

### Step 5 — Reset to original
After editing, click [↩ Reset]
Verify: content reverts to content_original
Verify: lee_edited = false

### Step 6 — Batch send
Generate 3 reports manually
Select all 3 via checkboxes
Click [📤 Send Selected (3)]
Verify: all 3 sent

### Step 7 — Auto-send settings
Open Auto-Send Settings drawer
Verify: all 11 report types shown
Verify: confidence meters show 0/10 initially
Approve 3 reports manually
Verify: MORNING_BRIEF now shows 3/10

### Step 8 — Auto-send toggle
Force-enable auto-send for STANDUP_BRIEF
Generate a new STANDUP_BRIEF report
Verify: report created AND immediately sent (status = sent)
Verify: was_auto_sent = true in database

### Step 9 — Failed send
Temporarily break Lark token
Generate and send a report
Verify: status = failed, send_error populated
Verify: [Retry] button appears
Fix token, click Retry
Verify: status updates to sent

### Step 10 — Realtime
Keep /briefings open
Trigger a scan that generates a standup brief
Verify: new report row appears without refresh
Verify: amber highlight flash on new row

---

## Done Criteria

- [ ] briefing_reports table created
- [ ] briefing_autosend_config seeded (11 rows)
- [ ] generateReport() function created and working
- [ ] All existing briefing generators use generateReport()
- [ ] /briefings page loads with report feed
- [ ] Stats row shows draft/pending/sent/failed counts
- [ ] Filter by report type works
- [ ] Filter by status works
- [ ] Filter by cluster works
- [ ] Report rows show correct icon, name, time, status
- [ ] Click row → navigates to /briefings/[id]
- [ ] Detail page shows full content
- [ ] Detail page shows generation log (collapsible)
- [ ] Send destinations shown with checkboxes
- [ ] Edit mode: textarea pre-filled, saves correctly
- [ ] Reset to original works (lee_edited → false)
- [ ] [▶ Send Now] sends to selected destinations
- [ ] Batch send (select multiple + send) works
- [ ] Auto-send drawer opens from settings button
- [ ] All 11 report types shown in drawer
- [ ] Confidence meter accurate per type
- [ ] Toggle auto-send on/off works
- [ ] Force-enable with < 10 approvals shows warning
- [ ] Auto-sent reports show ⚡ badge in feed
- [ ] Lee-edited reports show ✏️ badge in feed
- [ ] Realtime: new reports appear without refresh
- [ ] Draft count badge on sidebar Briefings icon
- [ ] Zero TypeScript errors
- [ ] Deployed to production
