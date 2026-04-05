# Nucleus Watchdog — AI Observability Log Spec v1.0

**Feature:** Nucleus Watchdog — Monitoring & Observability Log
**Route:** /watchdog
**Sidebar:** Dedicated icon (Activity/Radio icon, bottom of sidebar)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## Philosophy

Everything Nucleus does must be visible, understandable, and correctable.

```
The fear: AI acts behind the scenes
           You can't see it
           You can't verify it
           You can't improve it

The fix:   Every action logged
           Every decision explained
           Every failure surfaced
           Nothing hidden
```

Not a debug tool for developers.
A command log for the CEO — plain language, scannable, actionable.

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Log retention | 30 days |
| Access | Separate sidebar icon (Activity/Radio) |
| IGNORED events | Always hidden (too noisy) |
| Correction loop | Later (v2) |
| Feed updates | Realtime via Supabase subscription |

---

## Event Types

### What gets logged (7 types)

```
📨 MESSAGE_RECEIVED
   A Lark message arrived from a monitored group
   Includes: sender, group, content preview, noise filter result

🧠 AI_CLASSIFIED
   AI made a classification decision
   Includes: category, severity, confidence, reasoning

⚡ INCIDENT_CREATED
   New incident was created (from message or silent ticket)
   Includes: title, cluster, priority, agent, how triggered

👤 LEE_ACTION
   Lee did something in Nucleus
   Includes: what action, what was changed, what was sent

📤 SYSTEM_SENT
   Nucleus sent a message to Lark
   Includes: what, to whom, success/fail, message preview

⏰ SCHEDULED_JOB
   A cron job ran
   Includes: job name, clusters affected, outcome summary

⚠️ ERROR
   Something failed
   Includes: what failed, why, what happened as fallback
```

### What does NOT get logged

```
IGNORED messages (noise filtered out — too many, no value)
Internal DB queries
Token refresh (routine, not meaningful)
Health checks
```

---

## Database

### New table: nucleus_activity_log

```sql
CREATE TABLE nucleus_activity_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),

  -- Event classification
  event_type text not null,
  -- MESSAGE_RECEIVED, AI_CLASSIFIED, INCIDENT_CREATED,
  -- LEE_ACTION, SYSTEM_SENT, SCHEDULED_JOB, ERROR

  event_subtype text,
  -- e.g. 'standup_report', 'silent_ticket', 'morning_brief'
  -- 'approved', 'edited', 'rejected', 'resolved'
  -- 'compliance_reminder', 'p1_alert', 'occ_review'

  -- Context
  cluster text,              -- C1-C11, ALL, or null
  group_name text,
  chat_id text,

  -- Summary (shown in log feed — plain language)
  summary text not null,     -- max 120 chars, human readable

  -- Detail (shown when expanded)
  detail jsonb,
  -- Flexible JSON for full trace data per event type

  -- Links
  incident_id uuid references incidents(id),
  lark_message_id text,

  -- Status
  success boolean default true,
  error_message text,        -- only for ERROR events

  -- Retention
  expires_at timestamptz default (now() + interval '30 days')
);
```

Add indexes:
```sql
CREATE INDEX idx_activity_log_created
  ON nucleus_activity_log(created_at DESC);

CREATE INDEX idx_activity_log_event_type
  ON nucleus_activity_log(event_type, created_at DESC);

CREATE INDEX idx_activity_log_cluster
  ON nucleus_activity_log(cluster, created_at DESC);

CREATE INDEX idx_activity_log_incident
  ON nucleus_activity_log(incident_id)
  WHERE incident_id IS NOT NULL;
```

Enable realtime on nucleus_activity_log.

Add pg_cron job to auto-delete expired logs:
```sql
SELECT cron.schedule(
  'delete-expired-logs',
  '0 2 * * *',
  'DELETE FROM nucleus_activity_log WHERE expires_at < now()'
);
```

---

## Detail JSON Structure Per Event Type

### MESSAGE_RECEIVED
```json
{
  "message_id": "om_xxx",
  "sender_name": "Airen",
  "sender_open_id": "ou_xxx",
  "sender_role": "IOE",
  "content_preview": "Daily report C11: MI 2 units...",
  "content_length": 127,
  "group_type": "cluster",
  "noise_filter": "passed",
  "noise_reason": null,
  "processing_time_ms": 23
}
```

### AI_CLASSIFIED
```json
{
  "input_content": "Cleaning Complaint: Unit AZR-A-13A-15...",
  "agent": "coo",
  "category": "cleaning",
  "severity": "YELLOW",
  "priority": "P2",
  "confidence": 88,
  "reasoning": "Message contains cleaning complaint for specific unit. OOE sender indicates operational relevance. @mention suggests action required.",
  "keywords_matched": ["complaint", "unit", "AZR-13A-15"],
  "is_incident": true,
  "model": "claude-sonnet-4-6",
  "tokens_used": 312,
  "processing_time_ms": 847
}
```

### INCIDENT_CREATED
```json
{
  "incident_id": "abc-123",
  "title": "Cleaning complaint AZR-A-13A-15 Azure Residence",
  "trigger": "lark_message",
  "trigger_message_id": "om_xxx",
  "agent": "coo",
  "category": "cleaning",
  "severity": "YELLOW",
  "priority": "P2",
  "ticket_id": null,
  "ai_proposal_generated": true,
  "proposal_confidence": 88,
  "status_after": "awaiting_lee"
}
```

### LEE_ACTION
```json
{
  "action": "approved_edited",
  "incident_id": "abc-123",
  "incident_title": "Cleaning complaint AZR-A-13A-15",
  "original_proposal": "David — AZR-A-13A-15 cleaning...",
  "final_message": "David — AZR-A-13A-15 cleaning...\n4. Log this in complaint tracker",
  "edit_summary": "Added step 4 about complaint tracker",
  "sent_to_chat_id": "oc_xxx",
  "sent_as_thread": true,
  "root_message_id": "om_yyy",
  "time_to_decision_seconds": 287
}
```

### SYSTEM_SENT
```json
{
  "message_type": "morning_brief",
  "recipient_type": "cluster_group",
  "recipient_chat_id": "oc_xxx",
  "recipient_name": "C11 — M Vertica",
  "sent_as": "lee_user_token",
  "message_preview": "📊 C11 — M Vertica | Pre-Standup Brief...",
  "lark_message_id": "om_xxx",
  "success": true,
  "latency_ms": 423
}
```

### SCHEDULED_JOB
```json
{
  "job_name": "morning_brief",
  "schedule": "8:30am MYT Mon-Sat",
  "clusters_processed": ["C1","C2","C3","C4","C5","C6","C7","C8","C9","C10","C11"],
  "successes": 11,
  "failures": 0,
  "duration_seconds": 47,
  "data_sources_read": ["ai_report", "ooe_group", "maint_group", "sales_group"],
  "incidents_found": 3,
  "silent_tickets_flagged": 2
}
```

### ERROR
```json
{
  "error_type": "lark_api_error",
  "endpoint": "/contact/v3/users/ou_xxx",
  "http_status": 403,
  "error_message": "Insufficient permissions to read user info",
  "context": "Resolving sender name for message om_xxx",
  "fallback_taken": "Displayed as 'Unknown'",
  "retry_scheduled": true,
  "retry_at": "2026-04-05T14:00:00Z"
}
```

---

## lib/activity-logger.ts

```typescript
import { supabaseAdmin } from './supabase'

type EventType =
  | 'MESSAGE_RECEIVED'
  | 'AI_CLASSIFIED'
  | 'INCIDENT_CREATED'
  | 'LEE_ACTION'
  | 'SYSTEM_SENT'
  | 'SCHEDULED_JOB'
  | 'ERROR'

interface LogEntry {
  event_type: EventType
  event_subtype?: string
  cluster?: string
  group_name?: string
  chat_id?: string
  summary: string        // max 120 chars, plain language
  detail?: Record<string, unknown>
  incident_id?: string
  lark_message_id?: string
  success?: boolean
  error_message?: string
}

export async function log(entry: LogEntry): Promise<void> {
  try {
    await supabaseAdmin
      .from('nucleus_activity_log')
      .insert({
        ...entry,
        expires_at: new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000
        ).toISOString()
      })
  } catch (error) {
    // Never throw from logger — logging failures are silent
    console.error('[activity-logger] Failed to log:', error)
  }
}

// Convenience wrappers

export const logger = {
  messageReceived: (params: {
    messageId: string
    senderName: string
    senderRole?: string
    cluster: string
    groupName: string
    chatId: string
    contentPreview: string
    contentLength: number
    noisePassed: boolean
  }) => log({
    event_type: 'MESSAGE_RECEIVED',
    cluster: params.cluster,
    group_name: params.groupName,
    chat_id: params.chatId,
    lark_message_id: params.messageId,
    summary: `${params.senderName} posted in ${params.groupName} — ${params.contentPreview.slice(0, 60)}`,
    detail: {
      message_id: params.messageId,
      sender_name: params.senderName,
      sender_role: params.senderRole,
      content_preview: params.contentPreview,
      content_length: params.contentLength,
      noise_filter: params.noisePassed ? 'passed' : 'blocked'
    }
  }),

  aiClassified: (params: {
    inputContent: string
    cluster: string
    agent: string
    category: string
    severity: string
    priority: string
    confidence: number
    reasoning: string
    isIncident: boolean
    tokensUsed: number
    processingMs: number
  }) => log({
    event_type: 'AI_CLASSIFIED',
    cluster: params.cluster,
    summary: `AI: ${params.category} · ${params.severity} · ${params.priority} · ${params.confidence}% confidence`,
    detail: {
      input_content: params.inputContent,
      agent: params.agent,
      category: params.category,
      severity: params.severity,
      priority: params.priority,
      confidence: params.confidence,
      reasoning: params.reasoning,
      is_incident: params.isIncident,
      tokens_used: params.tokensUsed,
      processing_time_ms: params.processingMs
    }
  }),

  incidentCreated: (params: {
    incidentId: string
    title: string
    cluster: string
    trigger: string
    priority: string
    severity: string
    confidence: number
  }) => log({
    event_type: 'INCIDENT_CREATED',
    cluster: params.cluster,
    incident_id: params.incidentId,
    summary: `Incident created: "${params.title.slice(0, 60)}" · ${params.priority} ${params.severity}`,
    detail: {
      incident_id: params.incidentId,
      title: params.title,
      trigger: params.trigger,
      priority: params.priority,
      severity: params.severity,
      proposal_confidence: params.confidence
    }
  }),

  leeAction: (params: {
    action: string
    incidentId: string
    incidentTitle: string
    cluster: string
    editSummary?: string
    sentAsThread?: boolean
    timeToDecisionSeconds?: number
  }) => log({
    event_type: 'LEE_ACTION',
    event_subtype: params.action,
    cluster: params.cluster,
    incident_id: params.incidentId,
    summary: `Lee ${params.action}: "${params.incidentTitle.slice(0, 50)}"${params.editSummary ? ` — ${params.editSummary}` : ''}`,
    detail: {
      action: params.action,
      incident_id: params.incidentId,
      incident_title: params.incidentTitle,
      edit_summary: params.editSummary,
      sent_as_thread: params.sentAsThread,
      time_to_decision_seconds: params.timeToDecisionSeconds
    }
  }),

  systemSent: (params: {
    messageType: string
    recipientName: string
    chatId: string
    cluster?: string
    messagePreview: string
    success: boolean
    latencyMs?: number
    errorMessage?: string
  }) => log({
    event_type: 'SYSTEM_SENT',
    event_subtype: params.messageType,
    cluster: params.cluster,
    chat_id: params.chatId,
    summary: `Sent ${params.messageType} to ${params.recipientName} — ${params.success ? '✓' : '✗ failed'}`,
    success: params.success,
    error_message: params.errorMessage,
    detail: {
      message_type: params.messageType,
      recipient_name: params.recipientName,
      recipient_chat_id: params.chatId,
      message_preview: params.messagePreview.slice(0, 100),
      success: params.success,
      latency_ms: params.latencyMs
    }
  }),

  scheduledJob: (params: {
    jobName: string
    clustersProcessed: string[]
    successes: number
    failures: number
    durationSeconds: number
    summary: string
    detail?: Record<string, unknown>
  }) => log({
    event_type: 'SCHEDULED_JOB',
    event_subtype: params.jobName,
    cluster: 'ALL',
    summary: `${params.jobName}: ${params.successes}/${params.clustersProcessed.length} clusters · ${params.durationSeconds}s`,
    success: params.failures === 0,
    detail: {
      job_name: params.jobName,
      clusters_processed: params.clustersProcessed,
      successes: params.successes,
      failures: params.failures,
      duration_seconds: params.durationSeconds,
      ...params.detail
    }
  }),

  error: (params: {
    errorType: string
    context: string
    message: string
    fallback?: string
    cluster?: string
  }) => log({
    event_type: 'ERROR',
    cluster: params.cluster,
    summary: `Error: ${params.context} — ${params.message.slice(0, 80)}`,
    success: false,
    error_message: params.message,
    detail: {
      error_type: params.errorType,
      context: params.context,
      error_message: params.message,
      fallback_taken: params.fallback
    }
  })
}
```

---

## Where to Add Logging (Integration Points)

### app/api/events/lark/route.ts
After saving message:
```typescript
await logger.messageReceived({ ... })
```

After classification:
```typescript
await logger.aiClassified({ ... })
```

### lib/incidents.ts — createIncident()
After insert:
```typescript
await logger.incidentCreated({ ... })
```

### lib/incidents.ts — leeDecides()
After Lee's action:
```typescript
await logger.leeAction({ ... })
```

### lib/incidents.ts — executeIncident()
After sending to Lark:
```typescript
await logger.systemSent({ ... })
```

### lib/briefings/pre-standup.ts — sendMorningBriefs()
After each send + after all 11:
```typescript
await logger.systemSent({ messageType: 'morning_brief', ... })
await logger.scheduledJob({ jobName: 'morning_brief', ... })
```

### lib/briefings/compliance.ts
After sending reminders:
```typescript
await logger.systemSent({ messageType: 'compliance_reminder', ... })
```

### lib/cross-group-intelligence.ts — runCrossGroupIntelligence()
After completion:
```typescript
await logger.scheduledJob({ jobName: 'cross_group_scan', ... })
```

### Any try/catch error block
```typescript
} catch (error) {
  await logger.error({
    errorType: 'api_error',
    context: 'Sending morning brief to C11',
    message: error.message,
    fallback: 'Skipped this cluster, continued with others'
  })
}
```

---

## API Routes

### GET /api/watchdog

Query params:
```
event_type: string (optional filter)
cluster: string (optional filter)
from: ISO date (default: 24h ago)
to: ISO date (default: now)
limit: number (default: 100, max: 500)
cursor: uuid (for pagination)
```

Response:
```json
{
  "events": [...],
  "stats": {
    "total": 127,
    "by_type": {
      "MESSAGE_RECEIVED": 47,
      "AI_CLASSIFIED": 32,
      "INCIDENT_CREATED": 8,
      "LEE_ACTION": 12,
      "SYSTEM_SENT": 24,
      "SCHEDULED_JOB": 3,
      "ERROR": 1
    },
    "errors_today": 1,
    "success_rate": 99.2
  },
  "next_cursor": "uuid"
}
```

### GET /api/watchdog/stats

Returns daily stats for the last 7 days:
```json
{
  "today": { ... },
  "yesterday": { ... },
  "last_7_days": {
    "messages_processed": 847,
    "incidents_created": 56,
    "lee_actions": 48,
    "errors": 3,
    "ai_accuracy": 94.2
  }
}
```

---

## The Watchdog Page UI (/watchdog)

### Page Layout

```
┌─────────────────────────────────────────────────────────────────┐
│ Watchdog                            ● LIVE      Lee Seng Hee    │
│ Everything Nucleus sees, does, and decides.                     │
├─────────────────────────────────────────────────────────────────┤
│ STATS ROW (today)                                               │
│                                                                 │
│ 127 processed  │  8 incidents  │  6 Lee actions  │  1 error    │
│ 47 groups read │  94% accuracy │  4m avg decision│  99% uptime │
├─────────────────────────────────────────────────────────────────┤
│ FILTER BAR                                                      │
│ [All] [📨 Messages] [🧠 AI] [⚡ Incidents] [👤 Lee] [📤 Sent]  │
│ [⏰ Jobs] [⚠️ Errors]                                            │
│                                                                 │
│ Cluster: [All][C1][C2]...[C11]                                  │
│ Time: [Last 1h][Last 24h][Last 7d][Custom]                      │
├─────────────────────────────────────────────────────────────────┤
│ LIVE INDICATOR                                                  │
│ ● Listening — last event 23 seconds ago                        │
├─────────────────────────────────────────────────────────────────┤
│ EVENT FEED                                                      │
│ [see event log design below]                                    │
└─────────────────────────────────────────────────────────────────┘
```

---

### Stats Row Design

```
┌───────────────┬───────────────┬───────────────┬───────────────┐
│     127       │      8        │      6        │      1        │
│  processed    │  incidents    │ Lee actions   │    error      │
│  today        │  created      │               │  ⚠️           │
├───────────────┼───────────────┼───────────────┼───────────────┤
│     47        │     94%       │    4 min      │    99%        │
│  groups read  │  AI accuracy  │  avg decision │   uptime      │
└───────────────┴───────────────┴───────────────┴───────────────┘
```

- Error count: red background if > 0
- AI accuracy: green > 90%, amber 70–90%, red < 70%
- Avg decision time: how long from incident created to Lee approved
- Stats auto-refresh every 60 seconds

---

### Event Feed Design

Each event is a compact row, expandable:

```
COLLAPSED (default — 2 lines):
┌─────────────────────────────────────────────────────────────────┐
│ 09:14:04  🧠  AI: cleaning · YELLOW · P2 · 88% confidence  C6  │
│               Cleaning complaint AZR-A-13A-15 Azure Residence   │
└─────────────────────────────────────────────────────────────────┘

EXPANDED (click to expand):
┌─────────────────────────────────────────────────────────────────┐
│ 09:14:04  🧠 AI CLASSIFIED                             C6  [∧] │
├─────────────────────────────────────────────────────────────────┤
│ INPUT                                                           │
│ "Cleaning Complaint: Unit AZR-A-13A-15 @_user_1,               │
│  please looks into it Can you confirm all cleaning..."         │
│                                                                 │
│ REASONING                                                       │
│ "Message contains cleaning complaint for specific unit          │
│  (AZR-A-13A-15). OOE sender indicates operational relevance.   │
│  @mention suggests someone needs to act."                      │
│                                                                 │
│ OUTPUT                                                          │
│ Agent: COO · Category: 🧹 Cleaning · Severity: YELLOW          │
│ Priority: P2 · Confidence: 88% · Tokens: 312 · 847ms          │
│                                                                 │
│ → Incident created [View incident →]                           │
└─────────────────────────────────────────────────────────────────┘
```

### Event row design by type

```
📨 MESSAGE_RECEIVED
  Left border: #4B5A7A (muted)
  Icon: 📨
  Format: "[time]  📨  [sender] in [group] — [content preview]  [cluster]"

🧠 AI_CLASSIFIED
  Left border: #9B6DFF (purple)
  Icon: 🧠
  Format: "[time]  🧠  AI: [category] · [severity] · [priority] · [confidence]%  [cluster]"
  If confidence < 70%: show ⚠️ low confidence warning

⚡ INCIDENT_CREATED
  Left border: #F2784B (coral)
  Icon: ⚡
  Format: "[time]  ⚡  Incident: "[title]" · [priority]  [cluster]  [→ link]"

👤 LEE_ACTION
  Left border: #4BF2A2 (green)
  Icon: 👤
  Format: "[time]  👤  Lee [action]: "[incident title]"  [cluster]"
  action words: approved · approved+edited · rejected · resolved · escalated

📤 SYSTEM_SENT
  Left border: #4BB8F2 (blue)
  Icon: 📤
  Format: "[time]  📤  Sent [message_type] to [recipient] ✓  [cluster]"
  If failed: red border, ✗ instead of ✓

⏰ SCHEDULED_JOB
  Left border: #E8A838 (amber)
  Icon: ⏰
  Format: "[time]  ⏰  [job_name]: [successes]/[total] clusters · [duration]s"

⚠️ ERROR
  Left border: #E05252 (red)
  Background: rgba(224,82,82,0.05)
  Icon: ⚠️
  Format: "[time]  ⚠️  Error: [context] — [message]  [cluster]"
  Always expanded by default
```

### Timestamp display

```
If < 1h ago:    "09:14:04" (time only, HH:MM:SS)
If today:       "09:14" (time only, HH:MM)
If yesterday:   "Yesterday 09:14"
If older:       "Apr 3 · 09:14"

Tooltip on hover: full ISO datetime
```

### Realtime behavior

```
New event arrives via Supabase subscription:
  1. Flash new event row with subtle highlight (1.5s)
  2. Scroll to top if user is at top of feed
  3. If user has scrolled down: show "X new events ↑" pill
     Click pill → scroll to top
  4. Live indicator updates: "last event Xs ago"

Error event:
  1. Red toast notification regardless of scroll position
  2. "⚠️ Error: [context]" with [View →] link
```

### Live indicator

```
● Listening — last event 23 seconds ago
```

- Green dot: pulsing (same as LIVE dot in header)
- Updates every second
- If no event for > 5 min: amber dot "● Quiet — 5m since last event"
- If Supabase disconnected: red dot "● Disconnected — reconnecting..."

---

### Grouped view option

Toggle: [Feed] [Grouped by Type]

Grouped shows:
```
⚠️ ERRORS (1)                              [expand all]
────────────────────────────────────────────────────────
[error row]

👤 LEE ACTIONS (6)
────────────────────────────────────────────────────────
[row] [row] [row] [row] [row] [row]

⚡ INCIDENTS CREATED (8)
────────────────────────────────────────────────────────
[row] [row] [row] ...

📤 SYSTEM SENT (24)
────────────────────────────────────────────────────────
[collapsed — click to expand]
```

Errors always at top and expanded.
System events (SENT, JOBS) collapsed by default.

---

### Incident trace view

Click any event linked to an incident → shows the full chain:

```
┌─────────────────────────────────────────────────────────────────┐
│ Incident Trace — "Cleaning complaint AZR-A-13A-15"    [X close]│
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ 09:14:03  📨 MESSAGE RECEIVED                                  │
│           David Lim posted in C6 group                         │
│           [expand]                                             │
│                ↓                                               │
│ 09:14:04  🧠 AI CLASSIFIED                                     │
│           cleaning · YELLOW · P2 · 88% confidence             │
│           [expand]                                             │
│                ↓                                               │
│ 09:14:05  ⚡ INCIDENT CREATED                                  │
│           Status: awaiting_lee                                 │
│           [expand]                                             │
│                ↓                                               │
│ 10:15:22  👤 LEE APPROVED (edited)                             │
│           Added step 4 · Sent as thread reply                  │
│           [expand]                                             │
│                ↓                                               │
│ 10:15:23  📤 SYSTEM SENT                                       │
│           Sent to C6 group as Lee · in thread ✓               │
│           [expand]                                             │
│                                                                │
│ [View incident in Command Center →]                            │
└─────────────────────────────────────────────────────────────────┘
```

This is the full story of one incident from detection to resolution.
Accessible from: clicking any event with an incident_id.

---

## Sidebar Integration

### Add to components/layout/Sidebar.tsx

```typescript
// Watchdog icon — between Memory and Settings
{
  icon: Activity,  // from lucide-react
  label: 'Watchdog',
  route: '/watchdog',
  badge: errorCount,  // red badge if errors today > 0
  badgeColor: 'red'
}
```

Position: near bottom of sidebar, above Settings.

Badge behavior:
- No badge: no errors today
- Red badge with count: errors exist today
- Badge clears at midnight (new day)

---

## Files to Create

```
app/(dashboard)/watchdog/page.tsx          ← server component
components/watchdog/WatchdogFeed.tsx       ← main client component
components/watchdog/EventRow.tsx           ← single event row
components/watchdog/EventDetail.tsx        ← expanded event detail
components/watchdog/IncidentTrace.tsx      ← full incident chain view
components/watchdog/StatsRow.tsx           ← today's stats
components/watchdog/LiveIndicator.tsx      ← ● Listening dot
components/watchdog/FilterBar.tsx          ← event type + cluster filters

lib/activity-logger.ts                     ← logging library (see above)

app/api/watchdog/route.ts                  ← GET events + stats
app/api/watchdog/stats/route.ts            ← GET daily stats
```

## Files to Update

```
app/api/events/lark/route.ts               ← add logger.messageReceived()
lib/incidents.ts                           ← add logger calls
lib/scanner.ts                             ← add logger.scheduledJob()
lib/briefings/pre-standup.ts              ← add logger.systemSent()
lib/briefings/compliance.ts               ← add logger.systemSent()
lib/cross-group-intelligence.ts           ← add logger.scheduledJob()
components/layout/Sidebar.tsx             ← add Watchdog link

supabase migration                         ← nucleus_activity_log table
```

---

## Testing Plan

### Step 1 — Migration
```
supabase db reset && supabase db push
Verify: nucleus_activity_log table exists
Verify: pg_cron job created for auto-delete
```

### Step 2 — Logger integration
```
Trigger a scan:
curl -X POST http://localhost:3000/api/lark/scan \
  -H "x-nucleus-secret: belive_nucleus_2026"

Check nucleus_activity_log:
  Should have SCHEDULED_JOB row for the scan
  Should have MESSAGE_RECEIVED rows for each message
  Should have AI_CLASSIFIED rows
  Should have INCIDENT_CREATED rows if new incidents
```

### Step 3 — Send a test message
```
Post in C11 cluster group:
  "Ada pipe bocor unit 12B, urgent"

Within seconds in nucleus_activity_log:
  MESSAGE_RECEIVED row → sender, content preview
  AI_CLASSIFIED row → category plumbing, reasoning
  INCIDENT_CREATED row → linked to incident
```

### Step 4 — Lee action logging
```
Open Command Center → find an incident
Approve the proposed action

In nucleus_activity_log:
  LEE_ACTION row → action: approved, incident title
  SYSTEM_SENT row → sent to cluster group
```

### Step 5 — Watchdog page
```
Open localhost:3000/watchdog

Verify:
  Stats row shows today's counts
  Event feed shows recent events
  📨 rows have sender + content preview
  🧠 rows show AI classification output
  ⚡ rows have incident link
  👤 rows show Lee's action description
  ⚠️ rows (if any errors) expanded by default

Click an event → expands with full detail
Click [View incident →] → navigates to /command/[id]
```

### Step 6 — Incident trace
```
Click any ⚡ INCIDENT_CREATED event
Verify: trace modal shows full chain
  📨 → 🧠 → ⚡ → (👤 if Lee acted) → (📤 if sent)
```

### Step 7 — Realtime
```
Keep watchdog page open
Post a message in C11 cluster group
Verify: new event rows appear within 5 seconds
Verify: live indicator updates "last event Xs ago"
```

### Step 8 — Error logging
```
Temporarily break Lark API (wrong token in env)
Trigger a scan
Verify: ⚠️ ERROR row appears in watchdog
Verify: red badge appears on Watchdog sidebar icon
```

### Step 9 — Filter
```
Click [🧠 AI] filter → only AI_CLASSIFIED events show
Click [C11] cluster → only C11 events
Click [⚠️ Errors] → only errors
Combine: [AI] + [C11] → AI events for C11 only
```

---

## Done Criteria

- [ ] nucleus_activity_log table created
- [ ] 30-day auto-delete pg_cron job configured
- [ ] lib/activity-logger.ts with all 7 event types
- [ ] MESSAGE_RECEIVED logged for every webhook message
- [ ] AI_CLASSIFIED logged with full reasoning text
- [ ] INCIDENT_CREATED logged with confidence + trigger
- [ ] LEE_ACTION logged with edit summary
- [ ] SYSTEM_SENT logged for all Lark sends
- [ ] SCHEDULED_JOB logged for all cron jobs
- [ ] ERROR logged for all catch blocks
- [ ] /watchdog page loads with stats row
- [ ] Stats row shows today's counts
- [ ] Event feed shows chronological events
- [ ] Each event type has correct icon + border color
- [ ] Event rows expand on click with full detail
- [ ] AI_CLASSIFIED shows full reasoning text
- [ ] Incident link in events navigates to /command/[id]
- [ ] Incident trace modal shows full chain
- [ ] Realtime: new events appear without refresh
- [ ] Live indicator shows time since last event
- [ ] Filter by event type works
- [ ] Filter by cluster works
- [ ] Error events always expanded by default
- [ ] Watchdog sidebar icon with red error badge
- [ ] Sidebar icon badge clears when no errors today
- [ ] Zero TypeScript errors
- [ ] Deployed to production
