# BeLive Nucleus — Overnight QC & Testing Run
# Version: 1.0
# Date: April 2026
# Author: Lee Seng Hee

---

## INSTRUCTIONS FOR CLAUDE CODE

You are the QA Engineer for BeLive Nucleus.
Your job is to systematically test every feature built so far.

RULES:
1. NEVER stop when a test fails — log it and continue
2. ALL message sends go to testing group ONLY:
   oc_585301f0077f09015428801da0cba90d
3. NEVER send to real cluster groups during QC
4. Log EVERY failure with: what failed, what was expected, what actually happened
5. At the end: produce a full QC report before fixing anything
6. Fix in priority order: P0 (broken) → P1 (wrong) → P2 (cosmetic)

TESTING GROUP:
  Name: Nucleus Testing Group
  Chat ID: oc_585301f0077f09015428801da0cba90d

---

## PRE-FLIGHT

Before starting any tests, read these files completely:
1. CLAUDE.md
2. docs/NUCLEUS-PRD-v1.md
3. docs/features/command-center-war-room/SPEC.md
4. docs/features/incident-detail-panel/SPEC.md
5. docs/features/cluster-health-wall/SPEC.md
6. docs/features/watchdog/SPEC.md
7. docs/features/lark-sso-auth/SPEC.md

Then load all skills listed in CLAUDE.md.

Start the dev server: npm run dev
Confirm it starts with zero TypeScript errors.
If TypeScript errors exist: log them all, continue.

---

## QC LOG FORMAT

For every test, write one of:
  ✅ PASS: [test name] — [what was verified]
  ❌ FAIL: [test name] — Expected: [X] Got: [Y]
  ⚠️ WARN: [test name] — Works but [concern]
  ⏭️ SKIP: [test name] — [reason]

At end: count PASS / FAIL / WARN / SKIP totals per phase.

---

## PHASE 1 — DATABASE INTEGRITY
## Goal: Verify Supabase schema is correct and data is clean

### 1.1 — Schema verification
Run in Supabase SQL editor or via supabase CLI:

```sql
-- List all tables
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;
```

Expected tables (minimum):
  incidents, incident_timeline, monitored_groups,
  lark_group_messages, lark_tokens, scan_schedules,
  cluster_health_cache, standup_sessions, daily_messages,
  staff_directory, nucleus_activity_log,
  lark_base_connections, lark_base_records,
  ai_report_tickets

For each expected table: ✅ PASS if exists, ❌ FAIL if missing

### 1.2 — Column verification

```sql
-- incidents table key columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'incidents'
ORDER BY ordinal_position;
```

Verify these columns exist on incidents:
  id, created_at, updated_at, source, source_message_id,
  chat_id, cluster, agent, problem_type, priority, severity,
  title, raw_content, sender_name, sender_open_id,
  ai_summary, ai_proposal, ai_confidence, status,
  lee_action, lee_instruction, sent_at, thread_keywords,
  silence_hours, has_lee_replied, escalation_due_at,
  ticket_id, ticket_age_days, sla_overdue, category,
  incident_type, auto_executed

❌ FAIL if any column missing.

```sql
-- cluster_health_cache key columns
SELECT column_name FROM information_schema.columns
WHERE table_name = 'cluster_health_cache'
ORDER BY ordinal_position;
```

Verify: cluster, health_status, health_score,
  maintenance_total, maintenance_overdue, maintenance_active,
  cleaning_total, move_in_pending, move_in_overdue,
  turnaround_total, turnaround_warning, turnaround_breach,
  today_compliance, standup_report_at, brief_sent_today

### 1.3 — Seed data verification

```sql
-- Verify all 11 clusters seeded in cluster_health_cache
SELECT cluster, cluster_name, chat_id
FROM cluster_health_cache
ORDER BY cluster;
```
Expected: 11 rows (C1 through C11)
❌ FAIL if count != 11 or any chat_id is null

```sql
-- Verify monitored_groups has all groups
SELECT group_name, group_type, scanning_enabled, chat_id
FROM monitored_groups
ORDER BY group_type, cluster;
```
Expected minimum:
  11 cluster groups (group_type = 'cluster')
  1 AI Report group (group_type = 'ai_report')
  1 IOE group, 1 OOE group, 1 Maintenance group (group_type = 'function')
  1 Sales Bookings, 1 Tenant Viewing (group_type = 'sales')

❌ FAIL if AI Report group missing
❌ FAIL if any cluster group missing

```sql
-- Verify Testing Group is in monitored_groups
SELECT * FROM monitored_groups
WHERE chat_id = 'oc_585301f0077f09015428801da0cba90d';
```
⚠️ WARN if missing (add it)

### 1.4 — Duplicate detection

```sql
-- Check for duplicate incidents from same source message
SELECT source_message_id, COUNT(*) as count
FROM incidents
WHERE source_message_id IS NOT NULL
GROUP BY source_message_id
HAVING COUNT(*) > 1;
```
❌ FAIL if any rows returned (duplicate incidents exist)

```sql
-- Check for duplicate lark_group_messages
SELECT message_id, COUNT(*) as count
FROM lark_group_messages
GROUP BY message_id
HAVING COUNT(*) > 1;
```
❌ FAIL if any rows returned

```sql
-- Check for orphaned timeline entries (no parent incident)
SELECT COUNT(*) as orphaned
FROM incident_timeline it
LEFT JOIN incidents i ON it.incident_id = i.id
WHERE i.id IS NULL;
```
❌ FAIL if count > 0

### 1.5 — Data quality check

```sql
-- Incidents with null required fields
SELECT id, title, status, cluster
FROM incidents
WHERE title IS NULL OR title = ''
   OR status IS NULL
   OR agent IS NULL
LIMIT 10;
```
❌ FAIL if any rows returned

```sql
-- Check incident status values are valid
SELECT status, COUNT(*) as count
FROM incidents
GROUP BY status;
```
Valid statuses: new, analysed, awaiting_lee, acting, resolved, archived
❌ FAIL if any unexpected status values

```sql
-- Check incidents have valid priority/severity
SELECT priority, severity, COUNT(*) as count
FROM incidents
GROUP BY priority, severity;
```
Valid: priority in (P1, P2, P3), severity in (RED, YELLOW, GREEN)
❌ FAIL if invalid values

```sql
-- Check cluster_health_cache last computed
SELECT cluster, last_computed_at,
  EXTRACT(EPOCH FROM (now() - last_computed_at))/3600 as hours_ago
FROM cluster_health_cache
ORDER BY last_computed_at ASC;
```
⚠️ WARN if any cluster not computed in last 2 hours

### 1.6 — Realtime enabled check

```sql
-- Check realtime is enabled on key tables
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;
```
Expected in realtime: incidents, incident_timeline,
  cluster_health_cache, lark_group_messages,
  standup_sessions, nucleus_activity_log

❌ FAIL if incidents not in realtime
❌ FAIL if cluster_health_cache not in realtime

---

## PHASE 2 — CORE FLOW END TO END
## Goal: The complete loop works correctly

### 2.1 — Webhook reception test

Send a test message to the testing group via Lark CLI:
```bash
lark-cli im +messages-send --as bot \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --text "QC Test 2.1 — pipe bocor unit 99A, testing room flood"
```

Wait 10 seconds. Then check:

```sql
-- Message should appear in lark_group_messages
SELECT message_id, sender_name, content, cluster, processed
FROM lark_group_messages
WHERE content LIKE '%QC Test 2.1%'
ORDER BY created_at DESC
LIMIT 1;
```
❌ FAIL if no row found (webhook not receiving group messages)
❌ FAIL if processed = false after 10 seconds

Check nucleus_activity_log:
```sql
SELECT event_type, summary, created_at
FROM nucleus_activity_log
WHERE summary LIKE '%QC Test 2.1%'
   OR summary LIKE '%99A%'
ORDER BY created_at DESC
LIMIT 5;
```
Expected: MESSAGE_RECEIVED event logged
❌ FAIL if no log entry

### 2.2 — AI classification test

```sql
-- Check if incident was created from test message
SELECT id, title, category, severity, priority,
  ai_confidence, status, sender_name
FROM incidents
WHERE raw_content LIKE '%QC Test 2.1%'
   OR raw_content LIKE '%pipe bocor unit 99A%'
ORDER BY created_at DESC
LIMIT 1;
```

Expected:
  category = 'plumbing' (or similar)
  severity = RED or YELLOW
  priority = P1 or P2
  ai_confidence > 60
  status = awaiting_lee

❌ FAIL if no incident created
❌ FAIL if category is 'other' (AI not classifying correctly)
❌ FAIL if ai_confidence = 0

Check AI_CLASSIFIED log entry:
```sql
SELECT event_type, summary, detail
FROM nucleus_activity_log
WHERE event_type = 'AI_CLASSIFIED'
ORDER BY created_at DESC
LIMIT 3;
```
❌ FAIL if no AI_CLASSIFIED entry
⚠️ WARN if reasoning field is empty

### 2.3 — Lee approval flow test

Get the incident ID from 2.2, then call the API:
```bash
# Get incident ID first
INCIDENT_ID=$(curl -s "http://localhost:3000/api/incidents?status=awaiting_lee&limit=1" \
  | python3 -c "import sys,json; data=json.load(sys.stdin); print(data['incidents'][0]['id'] if data['incidents'] else 'NONE')")

echo "Testing with incident: $INCIDENT_ID"

# Approve the incident
curl -X POST "http://localhost:3000/api/incidents/$INCIDENT_ID/decide" \
  -H "Content-Type: application/json" \
  -H "Cookie: nucleus_session=TEST" \
  -d '{"action": "approved"}'
```

Note: if auth blocks this, test via the UI directly.

Verify:
```sql
SELECT id, status, lee_action, lee_decided_at,
  sent_at, sent_to_chat_id, has_lee_replied
FROM incidents
WHERE id = '[INCIDENT_ID]';
```
Expected:
  status = 'acting'
  lee_action = 'approved'
  lee_decided_at IS NOT NULL
  sent_at IS NOT NULL

❌ FAIL if status still 'awaiting_lee' after approval
❌ FAIL if sent_at is null (message not sent)

Check Lark Testing Group — verify message arrived:
```bash
lark-cli im +messages-list \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --limit 5
```
❌ FAIL if no message from Nucleus bot in testing group

Check LEE_ACTION log:
```sql
SELECT event_type, summary, detail
FROM nucleus_activity_log
WHERE event_type = 'LEE_ACTION'
ORDER BY created_at DESC
LIMIT 3;
```
❌ FAIL if no LEE_ACTION entry

### 2.4 — Thread linking test

Send a follow-up message mentioning the same unit:
```bash
lark-cli im +messages-send --as bot \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --text "QC Test 2.4 — update on 99A: contractor on the way"
```

Wait 10 seconds. Then check:
```sql
-- Should link to existing incident, not create new one
SELECT e.entry_type, e.content, e.incident_id,
  i.title as incident_title
FROM incident_timeline e
JOIN incidents i ON e.incident_id = i.id
WHERE e.content LIKE '%QC Test 2.4%'
   OR e.content LIKE '%99A%'
ORDER BY e.created_at DESC
LIMIT 5;
```
Expected:
  entry_type = 'message'
  incident_id = same incident from 2.2 (not a new one)

❌ FAIL if no timeline entry created
❌ FAIL if new duplicate incident created instead of linking

### 2.5 — Resolve flow test

```bash
curl -X PATCH "http://localhost:3000/api/incidents/$INCIDENT_ID" \
  -H "Content-Type: application/json" \
  -d '{"status": "resolved", "resolution_note": "QC test resolution"}'
```

Verify:
```sql
SELECT status, resolved_at, resolved_by, resolution_note
FROM incidents
WHERE id = '[INCIDENT_ID]';
```
Expected:
  status = 'resolved'
  resolved_at IS NOT NULL

❌ FAIL if status not updated
❌ FAIL if resolved_at is null

### 2.6 — Silent ticket flow test

Insert a test AI report ticket with no cluster activity:
```sql
INSERT INTO ai_report_tickets
(report_date, ticket_id, age_days, sla_date, sla_overdue,
 owner_role, owner_name, property, cluster, unit_number,
 room, issue_description, summary, status)
VALUES
(CURRENT_DATE, 'BLV-QC-TEST-001', 3.0, CURRENT_DATE - 1,
 true, 'IOE', 'QC Test Owner', 'M Vertica Residence',
 'C11', 'QC-99B', 'Room 1', 'QC Test — Water heater broken',
 'QC test ticket for silent detection', 'open');
```

Trigger cross-group intelligence scan:
```bash
curl -X POST http://localhost:3000/api/lark/scan \
  -H "x-nucleus-secret: belive_nucleus_2026"
```

Wait 30 seconds. Check:
```sql
-- Silent ticket incident should be created
SELECT id, title, incident_type, status, ai_proposal,
  ticket_id, sla_overdue
FROM incidents
WHERE ticket_id = 'BLV-QC-TEST-001';
```
Expected:
  incident_type = 'silent_ticket'
  status = 'awaiting_lee'
  ai_proposal IS NOT NULL (probe message generated)
  sla_overdue = true

❌ FAIL if no incident created for silent ticket
❌ FAIL if ai_proposal is null
⚠️ WARN if probe message doesn't mention the unit (QC-99B)

Clean up:
```sql
DELETE FROM ai_report_tickets WHERE ticket_id = 'BLV-QC-TEST-001';
DELETE FROM incidents WHERE ticket_id = 'BLV-QC-TEST-001';
```

---

## PHASE 3 — INTELLIGENCE ACCURACY
## Goal: AI is doing the right thing

### 3.1 — Classification accuracy test

Send these 10 test messages to testing group and verify
each is classified correctly:

```bash
# Test messages array
declare -a MESSAGES=(
  "QC-3.1a: AC rosak unit 12B dah 3 hari, tenant complaint"
  "QC-3.1b: pipe bocor kat bilik air lantai 3, flooding corridor"
  "QC-3.1c: lift tidak berfungsi sejak semalam, stuck at floor 5"
  "QC-3.1d: tenant baru nak masuk unit 8A tapi kunci tak dapat"
  "QC-3.1e: move out inspection unit 15C - OOE please check"
  "QC-3.1f: cleaning complaint unit 7B, bathroom very dirty"
  "QC-3.1g: access card cloned - 3 tenants affected block A"
  "QC-3.1h: water heater not working unit 22D since yesterday"
  "QC-3.1i: electrical trip unit 5F, whole unit no power"
  "QC-3.1j: ok noted thank you"
)

for msg in "${MESSAGES[@]}"; do
  lark-cli im +messages-send --as bot \
    --chat-id "oc_585301f0077f09015428801da0cba90d" \
    --text "$msg"
  sleep 3
done
```

After all sent, wait 60 seconds then check:
```sql
SELECT title, category, severity, priority, ai_confidence
FROM incidents
WHERE raw_content LIKE '%QC-3.1%'
ORDER BY created_at DESC
LIMIT 20;
```

Expected classifications:
  QC-3.1a → category: air_con, severity: YELLOW or RED, P1 or P2
  QC-3.1b → category: plumbing, severity: RED, P1
  QC-3.1c → category: lift, severity: RED, P1
  QC-3.1d → category: move_in or door_lock
  QC-3.1e → category: move_out
  QC-3.1f → category: cleaning
  QC-3.1g → category: access_card, severity: RED
  QC-3.1h → category: water_heater
  QC-3.1i → category: electrical
  QC-3.1j → NO incident (noise, should be filtered)

❌ FAIL if QC-3.1j creates an incident (noise not filtered)
❌ FAIL if QC-3.1b not classified as plumbing
❌ FAIL if QC-3.1c not P1 or RED (lift failure is always urgent)
⚠️ WARN if ai_confidence < 70 on any non-ambiguous message

Count correct: N/9 (excluding 3.1j which should be ignored)
❌ FAIL if accuracy < 7/9

### 3.2 — AI Report parsing test

Create a test report message in format:
```bash
TEST_REPORT="Master Livability Report — M Vertica Residence — 2 Unresolved Tickets as of $(date +%d-%m-%y)

#1 — BLV-QC-PARSE-001 [2.5 days old] [SLA: $(date -v+1d +"%d %b %Y" 2>/dev/null || date -d '+1 day' +"%d %b %Y")] [Owner: [IOE] QC Tester]
  M Vertica Residence - M Vertica Residence, QC-01-01 - Room - 1
  Issue: QC Test — Water Heater Not Working
  Summary: QC test ticket for parser verification.

#2 — BLV-QC-PARSE-002 [8.1 days old] [SLA: $(date -v-1d +"%d %b %Y" 2>/dev/null || date -d '-1 day' +"%d %b %Y")] [Owner: [OOE] QC Tester 2]
  M Vertica Residence - M Vertica Residence, QC-02-02 - Room - 2
  Issue: QC Test — Move Out Turnaround Overdue
  Summary: QC test ticket to verify SLA overdue detection."

lark-cli im +messages-send --as bot \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --text "$TEST_REPORT"
```

Wait 30 seconds. Check parsing:
```sql
SELECT ticket_id, age_days, sla_overdue, owner_role,
  owner_name, unit_number, issue_description, cluster
FROM ai_report_tickets
WHERE ticket_id IN ('BLV-QC-PARSE-001', 'BLV-QC-PARSE-002')
ORDER BY ticket_id;
```

Expected:
  BLV-QC-PARSE-001: age_days ≈ 2.5, sla_overdue = false, cluster = C11
  BLV-QC-PARSE-002: age_days ≈ 8.1, sla_overdue = true, cluster = C11

❌ FAIL if tickets not parsed (parser broken)
❌ FAIL if cluster not mapped to C11 (M Vertica = C11)
❌ FAIL if sla_overdue wrong
⚠️ WARN if age_days differs by more than 0.5

Clean up:
```sql
DELETE FROM ai_report_tickets
WHERE ticket_id IN ('BLV-QC-PARSE-001', 'BLV-QC-PARSE-002');
```

### 3.3 — Staff name resolution test

```bash
curl -s "http://localhost:3000/api/staff" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
staff = data.get('staff', [])
print(f'Total staff: {len(staff)}')
lee = [s for s in staff if 'Lee' in s.get('name','')]
print(f'Lee found: {lee}')
"
```

Expected:
  Total staff > 0 (directory synced)
  Lee Seng Hee in directory with correct open_id

❌ FAIL if total staff = 0 (directory not synced)
❌ FAIL if Lee not found

Test name resolution specifically:
```bash
curl -s "http://localhost:3000/api/staff/ou_af2a40628719440234aa29656d06d322"
```
Expected: returns Lee Seng Hee with role = admin/CEO

❌ FAIL if 404 or error

### 3.4 — Cluster health computation test

```bash
curl -X POST http://localhost:3000/api/clusters/compute \
  -H "x-nucleus-secret: belive_nucleus_2026"
```

Verify:
```sql
SELECT cluster, health_status, health_score,
  maintenance_total, last_computed_at
FROM cluster_health_cache
ORDER BY cluster;
```

Expected:
  All 11 clusters have last_computed_at within last 5 minutes
  health_status is one of: red, amber, green
  health_score is between 0 and 100

❌ FAIL if any cluster not computed
❌ FAIL if health_score outside 0-100
❌ FAIL if health_status is null

### 3.5 — Thread keyword extraction test

```sql
-- Check that incidents have thread_keywords populated
SELECT id, title, thread_keywords
FROM incidents
WHERE status IN ('new', 'awaiting_lee', 'acting')
  AND source = 'lark_scan'
ORDER BY created_at DESC
LIMIT 10;
```

Expected:
  thread_keywords is not null
  thread_keywords is not empty array
  Keywords relevant to the incident title

❌ FAIL if thread_keywords is null on scan-created incidents
⚠️ WARN if keywords don't include unit numbers from title

---

## PHASE 4 — UI/UX VERIFICATION
## Goal: Every page loads, every action works

### 4.1 — Page load verification

For each route, check it loads without console errors:
```bash
# Start dev server first: npm run dev

ROUTES=(
  "/"
  "/command"
  "/clusters"
  "/groups"
  "/schedules"
  "/settings"
  "/watchdog"
  "/auth/login"
)

for route in "${ROUTES[@]}"; do
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    "http://localhost:3000$route")
  echo "$route: $RESPONSE"
done
```

Expected: all return 200 (or 307 redirect for auth-protected)
❌ FAIL if any returns 500

### 4.2 — API route health check

```bash
API_ROUTES=(
  "GET /api/incidents?limit=5"
  "GET /api/clusters"
  "GET /api/watchdog"
  "GET /api/groups"
  "GET /api/schedules"
  "GET /api/staff"
  "GET /api/bases"
)

for route in "${API_ROUTES[@]}"; do
  METHOD=$(echo $route | cut -d' ' -f1)
  PATH=$(echo $route | cut -d' ' -f2)
  RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
    -X $METHOD "http://localhost:3000$PATH" \
    -H "x-nucleus-secret: belive_nucleus_2026")
  echo "$route: $RESPONSE"
done
```

Expected: all return 200
❌ FAIL if any API returns 500
❌ FAIL if /api/incidents returns empty when incidents exist

### 4.3 — Command Center table verification

```bash
RESPONSE=$(curl -s "http://localhost:3000/api/incidents?limit=20&status=awaiting_lee")
echo $RESPONSE | python3 -c "
import sys, json
data = json.load(sys.stdin)
incidents = data.get('incidents', [])
print(f'Incidents returned: {len(incidents)}')
if incidents:
  i = incidents[0]
  required = ['id','title','cluster','severity','priority',
              'status','created_at','updated_at','category']
  missing = [f for f in required if f not in i or i[f] is None]
  print(f'Missing fields: {missing}')
  print(f'Category present: {i.get(\"category\")}')
  print(f'Timestamps: created={i.get(\"created_at\")}, updated={i.get(\"updated_at\")}')
"
```

❌ FAIL if incidents missing category field
❌ FAIL if incidents missing updated_at
❌ FAIL if incidents missing cluster

### 4.4 — Incident detail page verification

Get a real incident ID and check the detail API:
```bash
INCIDENT_ID=$(curl -s "http://localhost:3000/api/incidents?limit=1" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['incidents'][0]['id'] if d.get('incidents') else 'NONE')")

echo "Testing incident: $INCIDENT_ID"

curl -s "http://localhost:3000/api/incidents/$INCIDENT_ID" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
incident = data.get('incident', {})
timeline = data.get('timeline', [])
print(f'Incident title: {incident.get(\"title\")}')
print(f'Source message ID: {incident.get(\"source_lark_message_id\")}')
print(f'Timeline entries: {len(timeline)}')
print(f'AI proposal present: {bool(incident.get(\"ai_proposal\"))}')
print(f'Category: {incident.get(\"category\")}')
"
```

❌ FAIL if timeline not returned with incident
❌ FAIL if ai_proposal missing on awaiting_lee incidents

### 4.5 — Lark deeplink verification

```bash
# Check deeplink is generated for incident with source_message_id
curl -s "http://localhost:3000/api/incidents/$INCIDENT_ID" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
incident = data.get('incident', {})
msg_id = incident.get('source_lark_message_id')
if msg_id:
  deeplink = f'https://applink.larksuite.com/client/message/open?messageId={msg_id}'
  print(f'✅ Deeplink would be: {deeplink}')
else:
  print('⚠️ No source_lark_message_id — deeplink will show disabled')
"
```

⚠️ WARN if most incidents have no source_lark_message_id
  (means webhook isn't capturing message IDs correctly)

### 4.6 — Watchdog logging verification

```bash
curl -s "http://localhost:3000/api/watchdog?limit=20" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
events = data.get('events', [])
stats = data.get('stats', {})
print(f'Total events: {len(events)}')
print(f'By type: {stats.get(\"by_type\", {})}')

# Check event types present
types_found = set(e.get('event_type') for e in events)
expected_types = {'MESSAGE_RECEIVED', 'AI_CLASSIFIED', 'INCIDENT_CREATED'}
missing = expected_types - types_found
print(f'Event types found: {types_found}')
print(f'Missing expected types: {missing}')

# Check detail field populated
no_detail = [e for e in events if not e.get('detail')]
print(f'Events missing detail: {len(no_detail)}')
"
```

❌ FAIL if no MESSAGE_RECEIVED events (webhook not logging)
❌ FAIL if no AI_CLASSIFIED events (classification not logging)
❌ FAIL if no INCIDENT_CREATED events
⚠️ WARN if events missing detail field

### 4.7 — Realtime subscription test

Open browser at http://localhost:3000/command

In a separate terminal, insert a test incident directly:
```sql
INSERT INTO incidents
(source, cluster, agent, priority, severity, title, raw_content,
 status, category, problem_type)
VALUES
('manual', 'C11', 'coo', 'P2', 'YELLOW',
 'QC Realtime Test — unit 55X',
 'Testing realtime subscription',
 'awaiting_lee', 'general_repair', 'ops_maintenance');
```

Verify: incident appears in /command within 5 seconds
without page refresh

❌ FAIL if incident doesn't appear automatically
⚠️ WARN if appears after > 5 seconds

Clean up:
```sql
DELETE FROM incidents WHERE title = 'QC Realtime Test — unit 55X';
```

### 4.8 — Filter state restoration test

Programmatic check — verify sessionStorage logic exists:
```bash
grep -r "nucleus_command_state\|sessionStorage" \
  app/(dashboard)/command/ components/command/ \
  --include="*.tsx" --include="*.ts" -l
```

❌ FAIL if no files reference nucleus_command_state
  (state restoration not implemented)

Check the hook exists:
```bash
ls hooks/useCommandState.ts 2>/dev/null && \
  echo "✅ useCommandState hook exists" || \
  echo "❌ useCommandState hook missing"
```

### 4.9 — Lark SSO auth verification

Check middleware exists and protects routes:
```bash
ls middleware.ts 2>/dev/null && \
  echo "✅ middleware.ts exists" || \
  echo "❌ middleware.ts missing"

# Check public routes are defined
grep -c "PUBLIC_ROUTES\|/api/events/lark\|/api/cron" \
  middleware.ts 2>/dev/null || echo "❌ Public routes not defined"

# Check JWT library installed
grep "jose" package.json && \
  echo "✅ jose installed" || \
  echo "❌ jose not installed"
```

❌ FAIL if middleware.ts missing
❌ FAIL if jose not in package.json
❌ FAIL if /api/events/lark not in PUBLIC_ROUTES
  (webhook would break if auth applied to it)

Test unauthenticated access:
```bash
# Without session cookie — should redirect to /auth/login
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  --max-redirs 0 \
  "http://localhost:3000/command")
echo "Unauthenticated /command: $RESPONSE"
```
Expected: 307 (redirect to login)
❌ FAIL if 200 (page accessible without auth — security issue)

Test cron routes bypass auth:
```bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/cron" \
  -H "Authorization: Bearer belive_cron_2026")
echo "Cron route with secret: $RESPONSE"
```
Expected: 200 (cron accessible with secret)
❌ FAIL if 401 (cron routes broken by auth)

Test webhook bypass auth:
```bash
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  -X POST "http://localhost:3000/api/events/lark" \
  -H "Content-Type: application/json" \
  -d '{"challenge": "test"}')
echo "Webhook without auth: $RESPONSE"
```
Expected: 200 (webhook must be public)
❌ FAIL if 401 (webhook broken)

### 4.10 — Cluster Health Wall verification

```bash
curl -s "http://localhost:3000/api/clusters" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
clusters = data if isinstance(data, list) else data.get('clusters', [])
print(f'Clusters returned: {len(clusters)}')
for c in clusters:
  print(f'{c[\"cluster\"]}: {c[\"health_status\"]} score={c[\"health_score\"]}')
"
```

Expected: 11 clusters returned with health_status and score
❌ FAIL if fewer than 11 clusters
❌ FAIL if health_status is null on any cluster

---

## PHASE 5 — FAILURE MODE TESTING
## Goal: System fails gracefully

### 5.1 — Noise filtering verification

Send messages that should NOT create incidents:
```bash
NOISE_MESSAGES=(
  "ok"
  "noted"
  "👍"
  "thanks"
  "tq"
  "roger"
  "✅"
)

for msg in "${NOISE_MESSAGES[@]}"; do
  lark-cli im +messages-send --as bot \
    --chat-id "oc_585301f0077f09015428801da0cba90d" \
    --text "QC-5.1: $msg"
  sleep 2
done
```

Wait 30 seconds. Check:
```sql
SELECT COUNT(*) as noise_incidents
FROM incidents
WHERE raw_content LIKE '%QC-5.1%';
```
Expected: 0
❌ FAIL if any noise messages created incidents

### 5.2 — Duplicate prevention test

Send same message twice:
```bash
lark-cli im +messages-send --as bot \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --text "QC-5.2: pipe bocor unit 88Z duplicate test"

sleep 5

lark-cli im +messages-send --as bot \
  --chat-id "oc_585301f0077f09015428801da0cba90d" \
  --text "QC-5.2: pipe bocor unit 88Z duplicate test"
```

Wait 30 seconds. Check:
```sql
SELECT COUNT(*) as count, title
FROM incidents
WHERE raw_content LIKE '%QC-5.2%'
GROUP BY title;
```
Expected: 1 incident (not 2)
❌ FAIL if 2 incidents created (duplicate not prevented)

### 5.3 — Error logging verification

Test that errors are captured in Watchdog:
```bash
# Trigger a known-bad API call
curl -s "http://localhost:3000/api/incidents/non-existent-id-123"
```

Check if error logged:
```sql
SELECT event_type, summary, error_message
FROM nucleus_activity_log
WHERE event_type = 'ERROR'
ORDER BY created_at DESC
LIMIT 5;
```
⚠️ WARN if no ERROR events ever logged
  (may mean error logging not wired up)

### 5.4 — Token expiry handling

Check lark_tokens table for expired tokens:
```sql
SELECT token_type, app_id,
  expires_at,
  EXTRACT(EPOCH FROM (expires_at - now()))/3600 as hours_until_expiry,
  is_active
FROM lark_tokens
WHERE is_active = true
ORDER BY expires_at ASC;
```

⚠️ WARN if user_access_token expires within 1 hour
  (Lee needs to reconnect in Settings)
⚠️ WARN if no active user_access_token exists
  (send-as-Lee will fail)

### 5.5 — Cron route security test

```bash
# Without secret — should return 401
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/cron")
echo "Cron without secret: $RESPONSE"
```
Expected: 401
❌ FAIL if 200 (cron accessible without auth — security issue)

```bash
# With wrong secret — should return 401
RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" \
  "http://localhost:3000/api/cron" \
  -H "Authorization: Bearer wrong_secret")
echo "Cron with wrong secret: $RESPONSE"
```
Expected: 401
❌ FAIL if 200

### 5.6 — TypeScript compilation check

```bash
npx tsc --noEmit 2>&1 | head -50
```
Count TypeScript errors:
```bash
ERROR_COUNT=$(npx tsc --noEmit 2>&1 | grep -c "error TS")
echo "TypeScript errors: $ERROR_COUNT"
```
❌ FAIL if ERROR_COUNT > 0
  List all errors in the report

### 5.7 — Build check

```bash
npm run build 2>&1 | tail -20
```
❌ FAIL if build fails
⚠️ WARN if build has warnings

---

## POST-QC CLEANUP

Clean up all QC test data:
```sql
-- Remove all QC test incidents
DELETE FROM incident_timeline
WHERE incident_id IN (
  SELECT id FROM incidents WHERE raw_content LIKE '%QC%'
  OR title LIKE '%QC%'
);

DELETE FROM incidents
WHERE raw_content LIKE '%QC%'
   OR title LIKE '%QC%'
   OR title LIKE '%QC Test%';

-- Remove QC test messages
DELETE FROM lark_group_messages
WHERE content LIKE '%QC Test%'
   OR content LIKE '%QC-3.1%'
   OR content LIKE '%QC-5.%';

-- Remove QC test tickets
DELETE FROM ai_report_tickets
WHERE ticket_id LIKE '%QC%';

-- Remove QC log entries
DELETE FROM nucleus_activity_log
WHERE summary LIKE '%QC%'
   OR summary LIKE '%99A%'
   OR summary LIKE '%88Z%';
```

---

## FINAL QC REPORT

After all phases complete, produce this report:

```
═══════════════════════════════════════════════════════
BELIVE NUCLEUS — QC REPORT
Date: [date]
Engineer: Claude Code (QA Mode)
═══════════════════════════════════════════════════════

SUMMARY
───────────────────────────────────────────────────────
Phase 1 — Database Integrity:    [X PASS / X FAIL / X WARN]
Phase 2 — Core Flow E2E:         [X PASS / X FAIL / X WARN]
Phase 3 — Intelligence Accuracy: [X PASS / X FAIL / X WARN]
Phase 4 — UI/UX Verification:    [X PASS / X FAIL / X WARN]
Phase 5 — Failure Modes:         [X PASS / X FAIL / X WARN]

TOTAL: [X PASS] [X FAIL] [X WARN] [X SKIP]

OVERALL STATUS: [GREEN / AMBER / RED]
  GREEN: 0 FAIL
  AMBER: 1-3 FAIL (non-critical)
  RED: 4+ FAIL or any P0 failure

═══════════════════════════════════════════════════════
P0 FAILURES (system broken — fix immediately)
───────────────────────────────────────────────────────
[list each P0 failure with: test ID, what failed, impact]

P1 FAILURES (wrong behavior — fix before production use)
───────────────────────────────────────────────────────
[list each P1 failure]

P2 WARNINGS (non-critical — fix when possible)
───────────────────────────────────────────────────────
[list each warning]

═══════════════════════════════════════════════════════
FIXES NEEDED (priority order)
───────────────────────────────────────────────────────
1. [most critical fix]
2. [second most critical]
...

═══════════════════════════════════════════════════════
WHAT IS WORKING WELL
───────────────────────────────────────────────────────
[list things that passed cleanly — good for morale]

═══════════════════════════════════════════════════════
```

---

## AFTER THE REPORT — FIX PRIORITY ORDER

Only start fixing AFTER the full report is written.

Fix order:
1. P0: Security issues (auth bypass, webhook broken)
2. P0: Data integrity (duplicates, orphaned records)
3. P0: Core flow broken (webhook → incident → approve → send)
4. P1: Wrong classifications (noise creating incidents)
5. P1: Missing features (deeplinks, state restoration)
6. P1: Logging gaps (Watchdog not capturing events)
7. P2: Performance warnings
8. P2: TypeScript errors

After ALL fixes:
```bash
npm run build
git add .
git commit -m "fix: QC pass — all P0 and P1 issues resolved"
git push origin dev
vercel --prod
```

Run Phase 2 (Core Flow) one more time to verify fixes.
Then deploy to production.
