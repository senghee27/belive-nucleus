# Briefings Schedule View — Feature Spec v1.0

**Feature:** Briefings Schedule View + Cron Execution Transparency
**Route:** /briefings (default tab: Schedule)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

```
Visibility before automation.
Trust before autonomy.

You cannot trust what you cannot see.
You cannot improve what you cannot measure.
You cannot automate what you don't understand.

The Schedule View answers:
  "What is supposed to happen?"
  "Did it happen?"
  "Why did it fail?"
  "What did it actually do?"

Only when Lee can see all of this clearly
can he confidently flip the auto-send toggle.
```

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Default tab | Schedule (operational status first) |
| Run now confirm | Confirm dialog for scheduled types, immediate for on-demand |
| Cron history view | Right-side drawer |

---

## Database

### New table: briefing_cron_runs

```sql
CREATE TABLE briefing_cron_runs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),

  -- Identity
  report_type text not null,
  cluster text,
  -- null for system-wide reports (MORNING_BRIEF, EOD_SUMMARY etc)
  -- 'C1'-'C11' for per-cluster reports (STANDUP_BRIEF)

  -- Trigger
  triggered_by text not null default 'cron',
  -- 'cron' | 'manual' | 'retry'
  triggered_by_user text,
  -- 'Lee Seng Hee' if manual, null if cron

  -- Timing
  started_at timestamptz not null,
  completed_at timestamptz,
  duration_seconds int,

  -- Outcome
  status text not null default 'running',
  -- 'running' | 'success' | 'failed' | 'skipped'
  error_message text,
  retry_count int default 0,

  -- Output
  report_id uuid references briefing_reports(id),
  -- null if failed before report could be generated

  -- Data sources
  sources_attempted jsonb default '[]',
  -- [{ name, type, attempted_at }]
  sources_succeeded jsonb default '[]',
  -- [{ name, type, completed_at, record_count }]
  sources_failed jsonb default '[]',
  -- [{ name, type, error }]

  -- AI usage
  tokens_used int,
  model text,

  -- Skip reason (when status = skipped)
  skip_reason text
  -- 'weekend', 'holiday', 'already_ran_today', 'disabled'
);

CREATE INDEX idx_cron_runs_type_started
  ON briefing_cron_runs(report_type, started_at DESC);

CREATE INDEX idx_cron_runs_cluster_started
  ON briefing_cron_runs(cluster, started_at DESC)
  WHERE cluster IS NOT NULL;

CREATE INDEX idx_cron_runs_status
  ON briefing_cron_runs(status, started_at DESC);

CREATE INDEX idx_cron_runs_started
  ON briefing_cron_runs(started_at DESC);
```

Enable realtime on briefing_cron_runs.

### New table: briefing_schedule_config

```sql
CREATE TABLE briefing_schedule_config (
  id uuid default gen_random_uuid() primary key,
  updated_at timestamptz default now(),

  report_type text not null unique,
  report_name text not null,
  report_icon text not null,         -- emoji
  category text not null,
  -- 'daily' | 'cluster' | 'management' | 'on_demand'

  -- Schedule
  enabled boolean default true,
  cron_expression text,
  -- '30 8 * * 1-6'  = 8:30am Mon-Sat
  -- null for on-demand types
  schedule_description text,
  -- 'Daily 8:30am MYT Mon–Sat'
  timezone text default 'Asia/Kuala_Lumpur',

  -- Per-cluster flag
  is_per_cluster boolean default false,
  -- true for STANDUP_BRIEF — runs 11 times (once per cluster)

  -- Default destinations (jsonb array)
  default_destinations jsonb default '[]',
  -- [{ chat_id, name, type, selected }]

  -- Stats (updated after each run)
  last_run_at timestamptz,
  last_run_status text,
  -- 'success' | 'failed' | 'skipped'
  last_report_id uuid references briefing_reports(id),
  next_run_at timestamptz,
  total_runs int default 0,
  successful_runs int default 0,
  failed_runs int default 0,
  success_rate int default 0         -- 0-100
);
```

Seed with all report types:
```sql
INSERT INTO briefing_schedule_config
(report_type, report_name, report_icon, category,
 cron_expression, schedule_description, is_per_cluster,
 default_destinations) VALUES

('MORNING_BRIEF', 'Morning Intelligence Briefing', '🌅', 'daily',
 '30 0 * * 1-6', 'Daily 8:30am MYT Mon–Sat', false,
 '[{"chat_id":"oc_a4addada959faf09e220364d4fabae75","name":"AI Report Group","type":"ai_report","selected":true},{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('MIDDAY_PULSE', 'Midday Pulse', '☀️', 'daily',
 '30 4 * * 1-6', 'Daily 12:30pm MYT Mon–Sat', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('EOD_SUMMARY', 'End of Day Summary', '🌙', 'daily',
 '30 10 * * 1-6', 'Daily 6:30pm MYT Mon–Sat', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('STANDUP_BRIEF', 'Pre-Standup Brief', '📋', 'cluster',
 '0 0 * * 1-6', 'Daily 8:00am MYT Mon–Sat × 11 clusters', true,
 '[]'),
-- destinations set per-cluster dynamically

('COMPLIANCE_ALERT', 'Compliance Alert', '⚠️', 'cluster',
 null, 'On trigger (no standup by 10:00am)', true, '[]'),

('WEEKLY_OPS', 'Weekly Operations Review', '📊', 'management',
 '0 1 * * 1', 'Every Monday 9:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('MONTHLY_REPORT', 'Monthly Performance Report', '📅', 'management',
 '0 1 1 * *', '1st of each month 9:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('OWNER_SATISFACTION', 'Owner Satisfaction Summary', '🏠', 'management',
 '0 2 * * 1', 'Every Monday 10:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('CLUSTER_SNAPSHOT', 'Cluster Snapshot', '🔍', 'on_demand',
 null, 'Manual trigger', true, '[]'),

('INCIDENT_SUMMARY', 'Incident Summary Report', '⚡', 'on_demand',
 null, 'Manual trigger', false, '[]'),

('SALES_SNAPSHOT', 'Sales Performance Snapshot', '💰', 'on_demand',
 null, 'Manual trigger', false, '[]');
```

---

## lib/briefings/cron-logger.ts

Wraps every cron execution with start/end logging.

```typescript
import { supabaseAdmin } from '../supabase'

export async function startCronRun(params: {
  report_type: string
  cluster?: string
  triggered_by?: 'cron' | 'manual' | 'retry'
  triggered_by_user?: string
}): Promise<string> {
  const { data } = await supabaseAdmin
    .from('briefing_cron_runs')
    .insert({
      ...params,
      triggered_by: params.triggered_by ?? 'cron',
      started_at: new Date().toISOString(),
      status: 'running'
    })
    .select('id')
    .single()
  return data!.id
}

export async function completeCronRun(
  runId: string,
  result: {
    status: 'success' | 'failed' | 'skipped'
    report_id?: string
    error_message?: string
    skip_reason?: string
    sources_attempted?: object[]
    sources_succeeded?: object[]
    sources_failed?: object[]
    tokens_used?: number
    model?: string
  }
): Promise<void> {
  const completedAt = new Date()
  const { data: run } = await supabaseAdmin
    .from('briefing_cron_runs')
    .select('started_at')
    .eq('id', runId)
    .single()

  const durationSeconds = run
    ? Math.round(
        (completedAt.getTime() - new Date(run.started_at).getTime()) / 1000
      )
    : null

  await supabaseAdmin
    .from('briefing_cron_runs')
    .update({
      ...result,
      completed_at: completedAt.toISOString(),
      duration_seconds: durationSeconds
    })
    .eq('id', runId)

  // Update schedule config stats
  await supabaseAdmin.rpc('update_schedule_stats', {
    p_report_type: result.status,
    p_status: result.status,
    p_report_id: result.report_id ?? null,
    p_run_at: completedAt.toISOString()
  })
}
```

### Usage in every cron function:

```typescript
// In lib/briefings/morning-brief.ts

export async function runMorningBrief(
  triggeredBy: 'cron' | 'manual' = 'cron',
  triggeredByUser?: string
) {
  const runId = await startCronRun({
    report_type: 'MORNING_BRIEF',
    triggered_by: triggeredBy,
    triggered_by_user: triggeredByUser
  })

  const sourcesAttempted: object[] = []
  const sourcesSucceeded: object[] = []
  const sourcesFailed: object[] = []

  try {
    // Read AI Report tickets
    sourcesAttempted.push({ name: 'AI Report Group', type: 'lark_group' })
    const tickets = await parseAIReport()
    sourcesSucceeded.push({
      name: 'AI Report Group',
      type: 'lark_group',
      record_count: tickets.length,
      completed_at: new Date().toISOString()
    })

    // Read Sales Base
    sourcesAttempted.push({ name: 'Tenant Sales Base', type: 'lark_base' })
    const sales = await getSalesData()
    if (sales) {
      sourcesSucceeded.push({
        name: 'Tenant Sales Base',
        type: 'lark_base',
        record_count: sales.length,
        completed_at: new Date().toISOString()
      })
    } else {
      sourcesFailed.push({
        name: 'Tenant Sales Base',
        type: 'lark_base',
        error: 'Base not connected'
      })
    }

    // Generate content via AI
    const { content, tokensUsed } = await generateMorningBriefContent(
      tickets, sales
    )

    // Create report record
    const reportId = await generateReport({
      report_type: 'MORNING_BRIEF',
      report_name: 'Morning Intelligence Briefing',
      scheduled_for: new Date(),
      content,
      generation_log: {
        sources_read: sourcesSucceeded,
        ai_reasoning: '...',
        processing_start: new Date().toISOString(),
        processing_end: new Date().toISOString(),
        duration_seconds: 0,
        tokens_used: tokensUsed,
        model: 'claude-sonnet-4-6',
        errors: sourcesFailed.map(s => (s as any).error)
      },
      destinations: getDefaultDestinations('MORNING_BRIEF')
    })

    await completeCronRun(runId, {
      status: 'success',
      report_id: reportId,
      sources_attempted: sourcesAttempted,
      sources_succeeded: sourcesSucceeded,
      sources_failed: sourcesFailed,
      tokens_used: tokensUsed,
      model: 'claude-sonnet-4-6'
    })

  } catch (error: any) {
    await completeCronRun(runId, {
      status: 'failed',
      error_message: error.message,
      sources_attempted: sourcesAttempted,
      sources_succeeded: sourcesSucceeded,
      sources_failed: sourcesFailed
    })
    throw error
  }
}
```

---

## API Routes

### app/api/briefings/schedule/route.ts

```
GET — Returns all briefing_schedule_config rows
  Includes: last_run_at, last_run_status, next_run_at
  Includes: last 1 cron run summary per type
  Groups by category: daily | cluster | management | on_demand
```

### app/api/briefings/schedule/[type]/route.ts

```
GET — Single schedule config
  Includes: full cron run history (last 30 runs)
  Includes: success rate chart data (last 30 days)

PATCH — Update schedule config
  Body: { enabled?: boolean }
  Enable/disable a scheduled report
```

### app/api/briefings/schedule/[type]/run/route.ts

```
POST — Trigger manual run
  Body: { cluster?: string, triggered_by_user: string }
  Starts generation immediately (async, does not block)
  Returns: { run_id, message: 'Generation started' }

  For STANDUP_BRIEF without cluster: runs for all 11 clusters
  For STANDUP_BRIEF with cluster: runs for that cluster only
```

### app/api/briefings/schedule/[type]/retry/route.ts

```
POST — Retry last failed run
  Finds most recent failed cron run for this type (+cluster if applicable)
  Increments retry_count
  Re-runs generation
  Returns: { run_id }
```

### app/api/briefings/cron-runs/route.ts

```
GET — Query cron run history
  Params: report_type, cluster, status, limit (default 30), cursor
  Returns: { runs: [...], next_cursor }
```

---

## Page Layout — /briefings

Two tabs: [📋 Schedule] [📄 Reports]
Default: Schedule tab.

```
┌─────────────────────────────────────────────────────────────────┐
│ Briefings & Reports                    ● LIVE    Lee Seng Hee   │
│                                                                 │
│ [📋 Schedule]  [📄 Reports]                                     │
├─────────────────────────────────────────────────────────────────┤
```

---

## Schedule Tab UI

### Section structure

```
DAILY OPERATIONAL (3 reports)
  🌅 Morning Intelligence Briefing
  ☀️ Midday Pulse
  🌙 End of Day Summary

CLUSTER BRIEFINGS (2 report types, 11 clusters)
  📋 Pre-Standup Brief
  ⚠️ Compliance Alert

MANAGEMENT (3 reports)
  📊 Weekly Operations Review
  📅 Monthly Performance Report
  🏠 Owner Satisfaction Summary

ON-DEMAND (3 types)
  🔍 Cluster Snapshot
  ⚡ Incident Summary Report
  💰 Sales Performance Snapshot
```

### Schedule Card Design

Each report type gets a card:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌅  Morning Intelligence Briefing              ✅ Last run OK    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Schedule        Daily 8:30am MYT Mon–Sat                        │
│ Last run        Today 08:30am · 47s · ✅ Success               │
│ Next run        Tomorrow 08:30am (in 19h 44m)                   │
│ Auto-send       OFF  (3/10 confidence)                          │
│ Success rate    ████████░░  82%  (18/22 runs)                   │
│                                                                 │
│ LAST 7 RUNS                                                     │
│ ✅ ✅ ❌ ✅ ⏭️ ✅ ✅                                              │
│ (dots with tooltip: date, status, duration)                     │
│                                                                 │
│ [▶ Run Now]  [📋 View Last Report]  [📜 View History]          │
└─────────────────────────────────────────────────────────────────┘
```

Status indicator (top right of card):
- ✅ green: last run succeeded
- ❌ red: last run failed — [Retry] button appears
- ⚠️ amber: last run succeeded but report not yet sent
- ⏸ gray: disabled
- 🔄 spinning: currently running

Last 7 runs dots:
- ✅ green dot: success
- ❌ red dot: failed
- ⏭️ gray dot: skipped (weekend/holiday)
- 🔄 pulsing: currently running
- Hover tooltip: "Apr 5 · 08:30am · 47s · Success"
- Click dot → opens history drawer filtered to that run

Success rate bar:
- 0-60%: red fill
- 61-80%: amber fill
- 81-100%: coral/green fill

### Cluster Reports Card — Expanded View

For STANDUP_BRIEF (is_per_cluster = true), show per-cluster status:

```
┌─────────────────────────────────────────────────────────────────┐
│ 📋  Pre-Standup Brief (11 clusters)          ⚠️ 1 failed        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Schedule        Daily 8:00am MYT Mon–Sat                        │
│ Last run        Today 08:00am                                   │
│                                                                 │
│ CLUSTER STATUS (today)                                          │
│                                                                 │
│ C1  JB              ✅ 08:01  47s   [View]                     │
│ C2  Penang          ✅ 08:02  52s   [View]                     │
│ C3  Nilai           ✅ 08:03  41s   [View]                     │
│ C4  Ampang          ❌ 08:04  --    [View error][Retry]         │
│ C5  Ara Damansara   ✅ 08:05  38s   [View]                     │
│ C6  PJ Subang       ✅ 08:06  44s   [View]                     │
│ C7  Seri Kembangan  ✅ 08:07  49s   [View]                     │
│ C8  Sentul          ✅ 08:08  43s   [View]                     │
│ C9  Cheras South    ✅ 08:09  51s   [View]                     │
│ C10 Mont Kiara      ✅ 08:10  46s   [View]                     │
│ C11 M Vertica       ✅ 08:11  39s   [View]                     │
│                                                                 │
│ [▶ Run All Now]  [↺ Retry Failed (1)]  [📜 View History]       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Run Now — Confirm Dialog

For scheduled report types (not on-demand):

```
┌──────────────────────────────────────────────┐
│ Run Morning Brief now?                       │
│                                              │
│ This will generate a new Morning             │
│ Intelligence Briefing immediately.           │
│                                              │
│ Last generated: Today 08:30am               │
│                                              │
│ Note: This is a manual run outside the      │
│ regular schedule. A new draft will be       │
│ created in Reports.                         │
│                                              │
│ [Cancel]              [▶ Run Now]           │
└──────────────────────────────────────────────┘
```

For on-demand types: no dialog, runs immediately.

While running: button becomes [🔄 Running...] with spinner.
Card status indicator becomes spinning.
After completion: toast notification with result.

---

## Cron History Drawer

Opens from [📜 View History] button.
Right-side drawer, 520px wide.

```
┌──────────────────────────────────────────────────────────┐
│ Run History — Morning Intelligence Briefing    [X close] │
│ Last 30 runs                                             │
├──────────────────────────────────────────────────────────┤
│                                                          │
│ 06 Apr 2026  08:30:01                      ✅ SUCCESS    │
│ ────────────────────────────────────────────────────     │
│ Triggered by   Vercel cron (scheduled)                   │
│ Duration       47 seconds                                │
│ Report         Morning Brief 6 Apr  [View report →]      │
│ Auto-sent      No — awaiting Lee                         │
│                                                          │
│ DATA SOURCES                                             │
│ ✅ AI Report Group     847 tickets parsed                │
│ ✅ C1–C11 groups       11/11 scanned                    │
│ ✅ Sales Base          234 records                       │
│ ❌ Viewing Base        not connected                     │
│                                                          │
│ AI Usage       2,847 tokens · claude-sonnet-4-6         │
│                                                          │
│ ──────────────────────────────────────────────────────   │
│                                                          │
│ 05 Apr 2026  08:30:00                      ✅ SUCCESS    │
│ Triggered by   Vercel cron (scheduled)                   │
│ Duration       52 seconds                                │
│ Report         Morning Brief 5 Apr  [View report →]      │
│ Auto-sent      Yes ⚡                                    │
│ [Expand ▼]                                               │
│                                                          │
│ ──────────────────────────────────────────────────────   │
│                                                          │
│ 04 Apr 2026  08:30:01                      ❌ FAILED     │
│ ────────────────────────────────────────────────────     │
│ Triggered by   Vercel cron (scheduled)                   │
│ Duration       30 seconds (timeout)                      │
│ Report         None generated                            │
│                                                          │
│ ERROR                                                    │
│ Lark API timeout after 30 seconds                        │
│ Retried 2 times — all failed                             │
│ Fallback: report not created                             │
│                                                          │
│ DATA SOURCES                                             │
│ ✅ AI Report Group     847 tickets parsed                │
│ ✅ C1–C11 groups       11/11 scanned                    │
│ ❌ Sales Base          timeout after 8s                  │
│ ❌ Viewing Base        not connected                     │
│                                                          │
│ [↺ Retry this run]                                       │
│                                                          │
│ ──────────────────────────────────────────────────────   │
│                                                          │
│ 03 Apr 2026  08:30:00                      ✅ SUCCESS    │
│ [Expand ▼]                                               │
│                                                          │
│ 02 Apr 2026  08:30:00                      ⏭️ SKIPPED    │
│ Reason: Saturday — not scheduled                         │
│                                                          │
│ [Load more runs]                                         │
└──────────────────────────────────────────────────────────┘
```

Design details:
- Failed runs: red left border, error section always expanded
- Skipped runs: muted, single line, no expand needed
- Success runs: collapsed by default, click to expand
- Each run shows data sources with counts — always visible
- [Retry this run] only on failed runs

---

## Realtime During a Manual Run

When Lee clicks [▶ Run Now]:

```
1. POST /api/briefings/schedule/MORNING_BRIEF/run
   Returns immediately: { run_id: 'abc-123', message: 'Generation started' }

2. Subscribe to briefing_cron_runs where id = run_id

3. Card shows live status:
   Status indicator: 🔄 spinning
   Run status line: "Running... (12s elapsed)"
   Data sources update in real-time as they complete:
     ✅ AI Report Group — 847 tickets parsed
     🔄 Sales Base — reading...
     ⏳ C1–C11 groups — waiting...

4. On completion:
   Status indicator: ✅ or ❌
   Toast: "Morning Brief generated successfully" or error
   If success: "View report →" link in toast
   Card last_run updates

5. If new report created:
   Badge on Reports tab increments
   Report appears in Reports tab as DRAFT
```

Live source tracking in card during run:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🌅  Morning Intelligence Briefing         🔄 Running... (12s)   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ CURRENT RUN                                                     │
│ ✅ AI Report Group       847 tickets · 3s                       │
│ ✅ Sales Base            234 records · 5s                       │
│ 🔄 Generating content... (AI writing)                           │
│                                                                 │
│ [Cancel run]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## On-Demand Report Generation

For CLUSTER_SNAPSHOT, INCIDENT_SUMMARY, SALES_SNAPSHOT:

Each card has a generation form that expands inline:

```
┌─────────────────────────────────────────────────────────────────┐
│ 🔍  Cluster Snapshot                         On-Demand          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ Generate a snapshot for a specific cluster.                     │
│                                                                 │
│ Cluster:  [C11 — M Vertica ▾]                                   │
│ Period:   [Last 7 days ▾]                                        │
│ Include:  ☑ Maintenance  ☑ Cleaning  ☑ Sales  ☑ Incidents      │
│                                                                 │
│ [▶ Generate Snapshot]                                           │
│                                                                 │
│ Last generated: Yesterday 3:45pm for C9  [View →]              │
└─────────────────────────────────────────────────────────────────┘
```

---

## Schedule Tab — Overall Stats Row

At top of Schedule tab:

```
┌──────────────┬──────────────┬──────────────┬──────────────┐
│      8       │      1       │      2       │     94%      │
│  Scheduled   │   Running    │   Failed     │ Success rate │
│  report types│  right now   │  today       │  last 7 days │
└──────────────┴──────────────┴──────────────┴──────────────┘
```

- Failed count: red background if > 0
- Running count: pulsing if > 0
- Success rate: color coded (green > 90%, amber 75–90%, red < 75%)

---

## Files to Create

```
components/briefings/ScheduleTab.tsx         ← main schedule view
components/briefings/ScheduleCard.tsx        ← single report type card
components/briefings/ClusterScheduleCard.tsx ← per-cluster variant
components/briefings/RunHistoryDrawer.tsx    ← cron history drawer
components/briefings/CronRunRow.tsx          ← single run in history
components/briefings/LiveRunStatus.tsx       ← real-time run progress
components/briefings/OnDemandCard.tsx        ← on-demand generation form
components/briefings/ScheduleStatsRow.tsx    ← top stats row

lib/briefings/cron-logger.ts                 ← start/complete run logging
lib/briefings/schedule-utils.ts             ← next run calc, formatting

app/api/briefings/schedule/route.ts         ← GET all schedules
app/api/briefings/schedule/[type]/route.ts  ← GET + PATCH single
app/api/briefings/schedule/[type]/run/route.ts  ← POST trigger run
app/api/briefings/schedule/[type]/retry/route.ts ← POST retry failed
app/api/briefings/cron-runs/route.ts        ← GET run history
```

## Files to Update

```
app/(dashboard)/briefings/page.tsx          ← add Schedule/Reports tabs
lib/briefings/morning-brief.ts              ← wrap with cron-logger
lib/briefings/pre-standup.ts                ← wrap with cron-logger
lib/briefings/compliance.ts                 ← wrap with cron-logger
lib/briefings/midday-pulse.ts               ← wrap with cron-logger
lib/briefings/eod-summary.ts               ← wrap with cron-logger
All other cron functions                    ← wrap with cron-logger
```

---

## Integration: Wrap Every Cron Function

This is the most important implementation step.
Every single briefing generation function must call startCronRun()
at the start and completeCronRun() at the end.

Pattern (same for all):
```typescript
// Top of every cron function:
const runId = await startCronRun({
  report_type: 'MORNING_BRIEF',     // or relevant type
  triggered_by: triggeredBy,
  triggered_by_user: triggeredByUser
})

// Track sources as you read them:
sourcesAttempted.push({ name: 'AI Report Group', type: 'lark_group' })
// ... read data ...
sourcesSucceeded.push({ name: 'AI Report Group', record_count: 847 })

// At the very end (success):
await completeCronRun(runId, { status: 'success', report_id, ... })

// In catch block (failure):
await completeCronRun(runId, { status: 'failed', error_message: err.message })
```

---

## Testing Plan

### Step 1 — Migration
```
supabase db push
Verify: briefing_cron_runs table exists
Verify: briefing_schedule_config seeded with 11 rows
Open Supabase Studio → check all 11 rows have correct cron_expression
```

### Step 2 — Schedule tab loads
```
Open localhost:3000/briefings
Default tab = Schedule
Verify: 4 sections visible (Daily / Cluster / Management / On-Demand)
Verify: 11 schedule cards rendered
Verify: each card shows schedule description, next run time
Verify: status indicator shows ⚠️ (no runs yet)
```

### Step 3 — Manual run via UI
```
Click [▶ Run Now] on Morning Brief card
Confirm dialog appears → click [▶ Run Now]
Verify: card shows 🔄 Running status
Verify: live source tracking appears in card
Wait for completion
Verify: status updates to ✅ or ❌
Verify: toast notification shows result
Verify: briefing_cron_runs has a new row
```

### Step 4 — Run history drawer
```
Click [📜 View History] on Morning Brief
Drawer opens from right
Verify: run from Step 3 appears at top
Verify: shows triggered_by, duration, data sources
Expand sources: verify counts shown
Close drawer
```

### Step 5 — Cluster report status
```
Click [▶ Run All Now] on Pre-Standup Brief card
Confirm dialog → run
Verify: 11 cluster rows show individual status
Each cluster updates as it completes
After all done: shows 11/11 or X/11 with failures
```

### Step 6 — Failed run display
```
Temporarily break Lark token
Click [▶ Run Now] on Morning Brief
Let it fail
Verify: card shows ❌ Failed
Verify: [Retry] button appears
Check history drawer: error message visible
Fix token → click [Retry]
Verify: new run starts, succeeds
```

### Step 7 — Realtime run progress
```
Keep /briefings open in browser
Trigger a run via CLI (not UI):
  curl -X POST /api/briefings/schedule/MORNING_BRIEF/run \
    -H "x-nucleus-secret: belive_nucleus_2026"
Verify: card updates without page refresh
Verify: spinner appears, source tracking updates live
```

### Step 8 — Reports tab still works
```
Click [📄 Reports] tab
Verify: reports generated in Steps 3-7 appear here
Verify: stats row shows correct counts
```

### Step 9 — On-demand generation
```
Open Cluster Snapshot card
Select C11, Last 7 days
Click [▶ Generate Snapshot]
Verify: run starts immediately (no confirm dialog)
Verify: report appears in Reports tab when complete
```

### Step 10 — Success rate
```
After 5+ runs, check each card
Verify: success rate bar shows correct percentage
Verify: colors correct (green > 80%)
Verify: last 7 dots reflect actual run history
```

---

## Done Criteria

- [ ] briefing_cron_runs table created
- [ ] briefing_schedule_config seeded with all 11 types
- [ ] cron-logger.ts: startCronRun() and completeCronRun() working
- [ ] All existing cron functions wrapped with cron-logger
- [ ] /briefings defaults to Schedule tab
- [ ] Schedule tab shows 4 sections
- [ ] All 11 schedule cards render correctly
- [ ] Each card shows schedule, last run, next run, success rate
- [ ] Last 7 dots show run history accurately
- [ ] Status indicator reflects last run outcome
- [ ] [▶ Run Now] shows confirm dialog for scheduled types
- [ ] On-demand types run immediately without confirm
- [ ] Live run progress visible in card during execution
- [ ] Data sources update in real-time during run
- [ ] Toast notification on run completion
- [ ] [📜 View History] opens drawer with run history
- [ ] History drawer shows full detail per run
- [ ] Failed runs show error message in drawer
- [ ] [Retry] button works on failed runs
- [ ] Cluster card shows per-cluster status grid
- [ ] [Retry Failed] retries only failed clusters
- [ ] Reports tab still works correctly
- [ ] Realtime: card updates without page refresh
- [ ] Zero TypeScript errors
- [ ] Deployed to production
