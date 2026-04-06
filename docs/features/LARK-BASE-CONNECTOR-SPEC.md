# Lark Base Connector — Feature Spec v1.0

**Feature:** Lark Base Connector — Generic structured data integration
**Routes:** /groups (Lark Bases section) + /clusters (Sales tab)
**Status:** Planned
**Author:** Lee Seng Hee
**Date:** April 2026

---

## What This Is

A generic connector that reads structured data from any Lark Base
(Bitable) into Nucleus. Sales and Viewing are the first two instances.
Built as infrastructure — future Bases (HR, Owner records, Finance)
plug in with zero code changes.

---

## Confirmed Decisions

| Question | Decision |
|----------|----------|
| Sync method | Polling every 15 min (webhook in v2) |
| Field mapping UI | Inside /groups page — new "Lark Bases" section |
| Sales view | 6th tab [📊 Sales] in Cluster detail panel |
| Field mapping | Manual — Lee maps columns to standard fields |
| Sales reading rules | Baked into Base config, not hardcoded |

---

## Architecture

```
Layer 1 — CONNECTION
  Lark Base URL → app_token + table_id + view_id
  Auth: existing LARK_APP_ID + LARK_APP_SECRET
  Status: connected / syncing / error / paused

Layer 2 — SCHEMA + MAPPING
  Fetch all columns from Lark Base API
  Lee maps Base columns → standard Nucleus fields
  Saved as JSON in lark_base_connections table
  Reading rules configured per Base type

Layer 3 — RECORDS
  Raw records synced to lark_base_records table
  Structured by mapped fields
  Queryable by all Nucleus features
  Retained 90 days
```

---

## First Two Bases

### Base 1: Tenant Sales Management 2026
```
URL format:
https://jsg6ayejxqm4.sg.larksuite.com/base/Un4CbzjMMaQEelseL6TlVNtfgff
  ?table=tblbg18ZE5vziYfD&view=vewgJDWfUa

base_type: sales
Key fields to map:
  Cluster → cluster
  Closing Date → record_date
  Created By → agent_name
  Development → property_name
  Sale Type → category (indoor/outdoor_own/external/uhomes)
  Virtual (Y/N) → is_virtual
```

### Base 2: Tenant Viewing Tracker 2026
```
base_type: viewing
Key fields to map:
  Date → record_date
  Cluster → cluster
  Agent → agent_name
  Property → property_name
  Outcome → status (booked/pending/rejected)
  Viewing Type → category
```

---

## Sales Reading Rules (baked into Base config)

```json
{
  "base_type": "sales",
  "reading_rules": {
    "total_formula": "indoor + outdoor_own",
    "excluded_categories": ["external_agent", "uhomes"],
    "indoor_includes_virtual": true,
    "never_add_virtual_separately": true,
    "per_person_display": "{name}: {indoor} sales ({virtual} virtual)",
    "company_total_display": "Indoor {indoor_total} + Outdoor Own {outdoor_total} = {grand_total}"
  }
}
```

When morning brief reads sales — these rules applied automatically.
Never double-counts. Never includes external/Uhomes in totals.

---

## Database

### New table: lark_base_connections

```sql
CREATE TABLE lark_base_connections (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Identity
  name text not null,
  description text,
  base_type text not null default 'custom',
  -- sales, viewing, hr, finance, owner, custom

  -- Lark Base coordinates
  app_token text not null,
  -- extracted from Base URL (the long ID after /base/)
  table_id text not null,
  -- extracted from ?table= param
  view_id text,
  -- extracted from &view= param (optional — filters records)
  base_url text not null,
  -- full original URL pasted by Lee

  -- Field mapping
  field_mapping jsonb not null default '{}',
  -- { "Base Column Name": "standard_field_name" }
  -- e.g. { "Cluster": "cluster", "Closing Date": "record_date" }

  -- Reading rules
  reading_rules jsonb default '{}',
  -- type-specific rules (sales rules, etc)

  -- Sync config
  sync_enabled boolean default true,
  sync_frequency_minutes int default 15,
  last_synced_at timestamptz,
  last_sync_status text default 'pending',
  -- pending, success, failed, syncing
  last_sync_error text,
  last_sync_record_count int default 0,
  total_records_synced int default 0,

  -- Status
  connection_status text default 'active',
  -- active, paused, error

  added_by text default 'Lee Seng Hee'
);
```

Add updated_at trigger.
Add indexes on base_type, connection_status.

### New table: lark_base_records

```sql
CREATE TABLE lark_base_records (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  -- Source
  connection_id uuid references lark_base_connections(id)
    on delete cascade not null,
  base_type text not null,
  lark_record_id text not null,
  -- Lark's own record ID (recXXXXXX)

  -- Standard mapped fields (used by Nucleus features)
  record_date date,           -- closing date, viewing date, etc
  cluster text,               -- C1-C11
  agent_name text,
  property_name text,
  unit_number text,
  category text,              -- indoor, outdoor_own, external, uhomes
  is_virtual boolean default false,
  status text,                -- booked, pending, rejected, etc
  amount numeric,             -- for financial records

  -- Raw data
  raw_fields jsonb not null default '{}',
  -- complete original record from Lark Base API

  -- Retention
  expires_at timestamptz default (now() + interval '90 days'),

  UNIQUE(connection_id, lark_record_id)
);
```

Add indexes:
```sql
CREATE INDEX idx_base_records_connection_date
  ON lark_base_records(connection_id, record_date DESC);

CREATE INDEX idx_base_records_cluster_date
  ON lark_base_records(cluster, record_date DESC);

CREATE INDEX idx_base_records_type_date
  ON lark_base_records(base_type, record_date DESC);
```

Enable realtime on lark_base_connections (for sync status updates).

Add pg_cron auto-delete:
```sql
SELECT cron.schedule(
  'delete-expired-base-records',
  '0 3 * * *',
  'DELETE FROM lark_base_records WHERE expires_at < now()'
);
```

---

## lib/lark-base-connector.ts

### Core functions

```typescript
import { supabaseAdmin } from './supabase'
import { getTenantToken } from './lark-tokens'

const LARK_BITABLE_BASE = 'https://open.larksuite.com/open-apis/bitable/v1'

// Parse Lark Base URL → extract coordinates
export function parseLarkBaseUrl(url: string): {
  app_token: string
  table_id: string | null
  view_id: string | null
} {
  // URL format:
  // https://[workspace].larksuite.com/base/[APP_TOKEN]?table=[TABLE_ID]&view=[VIEW_ID]
  const match = url.match(/\/base\/([A-Za-z0-9]+)/)
  const params = new URLSearchParams(url.split('?')[1] ?? '')
  return {
    app_token: match?.[1] ?? '',
    table_id: params.get('table'),
    view_id: params.get('view')
  }
}

// Fetch Base schema — returns all field names + types
export async function fetchBaseSchema(
  appToken: string,
  tableId: string
): Promise<BaseField[]> {
  const token = await getTenantToken()
  const res = await fetch(
    `${LARK_BITABLE_BASE}/apps/${appToken}/tables/${tableId}/fields`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return data.data?.items ?? []
}

// Fetch records from Base (with optional view filter)
export async function fetchBaseRecords(
  appToken: string,
  tableId: string,
  viewId?: string,
  pageToken?: string,
  pageSize = 100
): Promise<{ records: LarkBaseRecord[], hasMore: boolean, nextPageToken?: string }> {
  const token = await getTenantToken()
  const params = new URLSearchParams({
    page_size: String(pageSize),
    ...(viewId && { view_id: viewId }),
    ...(pageToken && { page_token: pageToken })
  })
  const res = await fetch(
    `${LARK_BITABLE_BASE}/apps/${appToken}/tables/${tableId}/records?${params}`,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  const data = await res.json()
  return {
    records: data.data?.items ?? [],
    hasMore: data.data?.has_more ?? false,
    nextPageToken: data.data?.page_token
  }
}

// Apply field mapping to a raw record
export function mapRecord(
  rawRecord: LarkBaseRecord,
  fieldMapping: Record<string, string>,
  baseType: string
): Partial<LarkBaseRecordInsert> {
  const mapped: Partial<LarkBaseRecordInsert> = {
    lark_record_id: rawRecord.record_id,
    raw_fields: rawRecord.fields,
    base_type: baseType
  }

  for (const [baseColumn, standardField] of Object.entries(fieldMapping)) {
    const value = rawRecord.fields[baseColumn]
    if (value === undefined || value === null) continue

    switch (standardField) {
      case 'record_date':
        // Lark dates come as timestamps in ms or date strings
        mapped.record_date = parseLarkDate(value)
        break
      case 'cluster':
        mapped.cluster = String(value).trim()
        break
      case 'agent_name':
        // Could be a user object or string
        mapped.agent_name = extractName(value)
        break
      case 'property_name':
        mapped.property_name = String(value).trim()
        break
      case 'unit_number':
        mapped.unit_number = String(value).trim()
        break
      case 'category':
        mapped.category = normalizeSalesCategory(String(value))
        break
      case 'is_virtual':
        mapped.is_virtual = Boolean(value) ||
          String(value).toLowerCase() === 'yes'
        break
      case 'status':
        mapped.status = String(value).toLowerCase()
        break
      case 'amount':
        mapped.amount = parseFloat(String(value)) || null
        break
    }
  }

  return mapped
}

// Sync all records for a connection (full sync)
export async function syncConnection(
  connectionId: string
): Promise<{ synced: number, errors: number }> {
  const { data: connection } = await supabaseAdmin
    .from('lark_base_connections')
    .select('*')
    .eq('id', connectionId)
    .single()

  if (!connection) throw new Error('Connection not found')

  // Update status to syncing
  await supabaseAdmin
    .from('lark_base_connections')
    .update({ last_sync_status: 'syncing' })
    .eq('id', connectionId)

  let synced = 0
  let errors = 0
  let pageToken: string | undefined
  let hasMore = true

  try {
    while (hasMore) {
      const { records, hasMore: more, nextPageToken } =
        await fetchBaseRecords(
          connection.app_token,
          connection.table_id,
          connection.view_id ?? undefined,
          pageToken
        )

      hasMore = more
      pageToken = nextPageToken

      for (const record of records) {
        try {
          const mapped = mapRecord(
            record,
            connection.field_mapping,
            connection.base_type
          )
          await supabaseAdmin
            .from('lark_base_records')
            .upsert({
              connection_id: connectionId,
              ...mapped,
              expires_at: new Date(
                Date.now() + 90 * 24 * 60 * 60 * 1000
              ).toISOString()
            }, { onConflict: 'connection_id,lark_record_id' })
          synced++
        } catch (err) {
          errors++
        }
      }
    }

    await supabaseAdmin
      .from('lark_base_connections')
      .update({
        last_synced_at: new Date().toISOString(),
        last_sync_status: 'success',
        last_sync_record_count: synced,
        total_records_synced: connection.total_records_synced + synced,
        last_sync_error: null
      })
      .eq('id', connectionId)

  } catch (err: any) {
    await supabaseAdmin
      .from('lark_base_connections')
      .update({
        last_sync_status: 'failed',
        last_sync_error: err.message
      })
      .eq('id', connectionId)
    throw err
  }

  return { synced, errors }
}

// Sync all enabled connections
export async function syncAllConnections(): Promise<void> {
  const { data: connections } = await supabaseAdmin
    .from('lark_base_connections')
    .select('id, name, last_synced_at, sync_frequency_minutes')
    .eq('sync_enabled', true)
    .eq('connection_status', 'active')

  if (!connections) return

  for (const conn of connections) {
    // Check if sync is due
    const lastSync = conn.last_synced_at
      ? new Date(conn.last_synced_at).getTime()
      : 0
    const dueAt = lastSync + conn.sync_frequency_minutes * 60 * 1000
    if (Date.now() < dueAt) continue

    try {
      await syncConnection(conn.id)
    } catch (err) {
      console.error(`[lark-base] Sync failed for ${conn.name}:`, err)
    }
  }
}
```

### Sales query functions

```typescript
// Get sales for a specific cluster and date range
export async function getSalesForCluster(
  cluster: string,
  dateFrom: Date,
  dateTo: Date
): Promise<SalesSummary> {
  const { data: records } = await supabaseAdmin
    .from('lark_base_records')
    .select('*')
    .eq('base_type', 'sales')
    .eq('cluster', cluster)
    .gte('record_date', dateFrom.toISOString().split('T')[0])
    .lte('record_date', dateTo.toISOString().split('T')[0])

  if (!records) return emptySalesSummary()

  // Apply sales reading rules:
  // Total = indoor + outdoor_own ONLY
  // Indoor already includes virtual — never add separately
  // Exclude: external_agent, uhomes

  const indoor = records.filter(r =>
    r.category === 'indoor' || r.category === 'indoor_own'
  )
  const outdoorOwn = records.filter(r => r.category === 'outdoor_own')
  const virtual = records.filter(r => r.is_virtual === true)
  // ^ these are already IN indoor, just for display

  // Per-agent breakdown
  const byAgent: Record<string, AgentSales> = {}
  for (const r of indoor) {
    const name = r.agent_name ?? 'Unknown'
    if (!byAgent[name]) byAgent[name] = { indoor: 0, virtual: 0 }
    byAgent[name].indoor++
    if (r.is_virtual) byAgent[name].virtual++
  }
  for (const r of outdoorOwn) {
    const name = r.agent_name ?? 'Unknown'
    if (!byAgent[name]) byAgent[name] = { indoor: 0, virtual: 0, outdoor_own: 0 }
    byAgent[name].outdoor_own = (byAgent[name].outdoor_own ?? 0) + 1
  }

  return {
    cluster,
    date_from: dateFrom,
    date_to: dateTo,
    indoor_total: indoor.length,
    outdoor_own_total: outdoorOwn.length,
    grand_total: indoor.length + outdoorOwn.length,
    virtual_count: virtual.length,
    by_agent: byAgent
  }
}

// Get viewing counts for a cluster
export async function getViewingsForCluster(
  cluster: string,
  date: Date
): Promise<ViewingSummary> {
  const dateStr = date.toISOString().split('T')[0]
  const { data: records } = await supabaseAdmin
    .from('lark_base_records')
    .select('*')
    .eq('base_type', 'viewing')
    .eq('cluster', cluster)
    .eq('record_date', dateStr)

  return {
    cluster,
    date,
    total: records?.length ?? 0,
    booked: records?.filter(r => r.status === 'booked').length ?? 0,
    pending: records?.filter(r => r.status === 'pending').length ?? 0,
    by_agent: groupByAgent(records ?? [])
  }
}

// Get yesterday's sales summary for morning brief
export async function getYesterdaySalesSummary(
  cluster: string
): Promise<string> {
  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)

  const sales = await getSalesForCluster(
    cluster, yesterday, yesterday
  )

  if (sales.grand_total === 0) return 'Tiada sales semalam'

  const agentLines = Object.entries(sales.by_agent)
    .map(([name, data]) => {
      const firstName = name.split(' ')[0]
      const virtualNote = data.virtual > 0
        ? ` (${data.virtual} virtual)` : ''
      return `${firstName} ✅ ${data.indoor}${virtualNote}`
    })
    .join(', ')

  return (
    `Indoor: ${sales.indoor_total} | ` +
    `Outdoor Own: ${sales.outdoor_own_total} | ` +
    `Total: ${sales.grand_total}\n${agentLines}`
  )
}
```

---

## API Routes

### app/api/bases/route.ts

```
GET — Returns all lark_base_connections
  Includes: sync status, last synced, record count

POST — Create new connection
  Body: { name, description, base_type, base_url, field_mapping, reading_rules }
  1. Parse base_url → app_token, table_id, view_id
  2. Test connection: fetch 1 record to verify access
  3. Insert to lark_base_connections
  4. Trigger initial sync (background)
  Return: created connection
```

### app/api/bases/schema/route.ts

```
POST — Fetch schema for a Base URL (before saving)
  Body: { base_url: string }
  1. Parse base_url
  2. Fetch fields from Lark Base API
  3. Return: { fields: [{ name, type, id }] }
  Used by: field mapping UI to show available columns
```

### app/api/bases/[id]/route.ts

```
PATCH — Update connection (field mapping, rules, name)
DELETE — Soft delete (set connection_status = 'paused')
```

### app/api/bases/[id]/sync/route.ts

```
POST — Trigger manual sync
  Protected by NUCLEUS_SECRET
  Calls syncConnection(id)
  Returns: { synced, errors, duration_ms }
```

### app/api/bases/[id]/records/route.ts

```
GET — Query records from this Base
  Params: cluster, date_from, date_to, category, limit
  Returns: paginated records
```

### app/api/cron/base-sync/route.ts

```
GET — Called by Vercel cron every 15 min
  Calls syncAllConnections()
  Returns: { synced_connections, total_records }
```

---

## Update vercel.json cron

Add:
```json
{ "path": "/api/cron/base-sync", "schedule": "*/15 * * * *" }
```

---

## UI — Groups Page: Lark Bases Section

### Update: app/(dashboard)/groups/page.tsx

Add new section below the monitored groups list:

```
┌─────────────────────────────────────────────────────────────────┐
│ Lark Bases                              [+ Connect Base]        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐    │
│ │ 📊 Tenant Sales Management 2026        ● Synced 5m ago  │    │
│ │ Sales · 847 records · Last: Apr 5, 11:45pm             │    │
│ │                                                         │    │
│ │ Fields mapped: Cluster, Date, Agent, Type, Virtual     │    │
│ │ Rules: Indoor + Outdoor Own = Total                    │    │
│ │                                                         │    │
│ │ [↻ Sync Now]  [✏️ Edit]  [⏸ Pause]                    │    │
│ └─────────────────────────────────────────────────────────┘    │
│                                                                 │
│ ┌─────────────────────────────────────────────────────────┐    │
│ │ 👁️ Tenant Viewing Tracker 2026         ● Synced 5m ago  │    │
│ │ Viewing · 234 records · Last: Apr 5, 11:30pm           │    │
│ │                                                         │    │
│ │ [↻ Sync Now]  [✏️ Edit]  [⏸ Pause]                    │    │
│ └─────────────────────────────────────────────────────────┘    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

Status indicator:
- ● green: synced < 20 min ago
- ● amber: synced > 20 min ago
- ● red: last sync failed
- ↻ spinning: currently syncing

---

## UI — Connect Base Flow (Drawer)

### Create: components/bases/ConnectBaseDrawer.tsx

Multi-step drawer:

**Step 1 — Paste URL**
```
┌─────────────────────────────────────────┐
│ Connect Lark Base               Step 1/3│
├─────────────────────────────────────────┤
│ Base URL                                │
│ ┌─────────────────────────────────────┐ │
│ │ Paste your Lark Base URL here...   │ │
│ └─────────────────────────────────────┘ │
│                                         │
│ Where to find it:                       │
│ Open your Base → copy the full URL     │
│ from your browser address bar          │
│                                         │
│ [Test Connection →]                     │
└─────────────────────────────────────────┘
```

On "Test Connection":
- Calls POST /api/bases/schema with the URL
- Shows: "✅ Connected — found 12 columns"
- Or: "❌ Cannot access this Base"
  → "Make sure BeLive Nucleus bot has access to this Base"

**Step 2 — Map Fields**
```
┌─────────────────────────────────────────┐
│ Map Fields                      Step 2/3│
├─────────────────────────────────────────┤
│ Base type: [Sales ▾]                    │
│                                         │
│ Base Column          Standard Field     │
│ ──────────────────────────────────────  │
│ Cluster           →  cluster       ✓    │
│ Closing Date      →  record_date   ✓    │
│ Created By        →  agent_name    ✓    │
│ Development       →  property_name ✓    │
│ Sale Type         →  category   [▾]     │
│ Is Virtual        →  is_virtual [▾]     │
│ Uhomes Count      →  [skip ▾]           │
│ External Agent    →  [skip ▾]           │
│                                         │
│ Auto-matched: 4/8 ✓                     │
│                                         │
│ [← Back]  [Continue →]                  │
└─────────────────────────────────────────┘
```

Auto-matching: if Base column name closely matches standard field
name → pre-fill the mapping. Lee can override.

Dropdown options for each row:
- cluster, record_date, agent_name, property_name
- unit_number, category, is_virtual, status, amount
- [skip] — don't sync this column

**Step 3 — Name + Rules**
```
┌─────────────────────────────────────────┐
│ Configure                       Step 3/3│
├─────────────────────────────────────────┤
│ Name                                    │
│ [Tenant Sales Management 2026      ]    │
│                                         │
│ Description (optional)                  │
│ [Daily sales records for all clusters] │
│                                         │
│ Sync frequency                          │
│ [Every 15 min ▾]                        │
│                                         │
│ Sales reading rules:                    │
│ ☑ Indoor already includes virtual      │
│ ☑ Total = Indoor + Outdoor Own only    │
│ ☑ Exclude: External Agent, Uhomes      │
│                                         │
│ [← Back]  [Connect Base ✓]             │
└─────────────────────────────────────────┘
```

On "Connect Base":
- Saves connection to DB
- Triggers initial sync (background)
- Shows progress: "Syncing 847 records..."
- Redirects back to /groups

---

## UI — Cluster Detail Panel: Sales Tab

### Update: components/clusters/ClusterDetailPanel.tsx

Add 6th tab:

```
[🔧 Maint] [🧹 Clean] [🚪 Move In] [🔄 Move Out] [📋 Daily Log] [📊 Sales]
```

### Sales Tab Content

```
┌──────────────────────────────────────────────────────┐
│ 📊 Sales & Viewing                    [Yesterday ▾]  │
├──────────────────────────────────────────────────────┤
│ SALES SUMMARY                                        │
│                                                      │
│ Indoor         7                                     │
│ Outdoor Own    2                                     │
│ Total          9   ← Indoor + Outdoor Own only       │
│                                                      │
│ Virtual        3   (already in Indoor — not added)   │
│                                                      │
├──────────────────────────────────────────────────────┤
│ PER AGENT                                            │
│                                                      │
│ Kit      ✅  3 sales (1 virtual)                     │
│ Airen    ✅  2 sales                                 │
│ Johan    ✅  2 sales (Outdoor Own)                   │
│ Mimi     ✅  1 sale  (1 virtual)                     │
│ Reen     —   0                                       │
│                                                      │
├──────────────────────────────────────────────────────┤
│ VIEWINGS                                             │
│                                                      │
│ Total viewings yesterday:  5                         │
│ Booked:  3  ·  Pending:  1  ·  Cancelled:  1        │
│                                                      │
│ Kit 2  ·  Airen 2  ·  Reen 1                        │
│                                                      │
├──────────────────────────────────────────────────────┤
│ DATA SOURCE                                          │
│ Tenant Sales Management 2026                         │
│ Synced: 5 min ago  [↻ Sync Now]                     │
└──────────────────────────────────────────────────────┘
```

Date selector at top: [Yesterday ▾]
Options: Yesterday / Today / This Week / This Month / Custom

Footer shows data source + last sync time.
"Sync Now" triggers immediate sync for this Base.

---

## Update Morning Brief Generator

### Update: lib/briefings/pre-standup.ts

Replace sales data reading from group chat with Base query:

```typescript
// In generateClusterBrief():

// OLD: parse Sales Bookings group messages (messy, error-prone)
// NEW: query lark_base_records directly (structured, accurate)

const yesterday = new Date()
yesterday.setDate(yesterday.getDate() - 1)

const [salesSummary, viewingSummary] = await Promise.all([
  getSalesForCluster(cluster, yesterday, yesterday),
  getViewingsForCluster(cluster, yesterday)
])

// Format for morning brief:
const salesText = formatSalesForBrief(salesSummary)
const viewingText = formatViewingForBrief(viewingSummary)
```

```typescript
function formatSalesForBrief(sales: SalesSummary): string {
  if (sales.grand_total === 0) return 'Tiada sales semalam'

  const lines = Object.entries(sales.by_agent)
    .filter(([_, d]) => (d.indoor + (d.outdoor_own ?? 0)) > 0)
    .map(([name, d]) => {
      const firstName = name.split(' ')[0]
      const total = d.indoor + (d.outdoor_own ?? 0)
      const virtualNote = d.virtual > 0 ? ` (${d.virtual} virtual)` : ''
      return `${firstName} ✅ ${total}${virtualNote}`
    })
    .join(' · ')

  return (
    `Total: ${sales.grand_total} ` +
    `(Indoor ${sales.indoor_total} + OO ${sales.outdoor_own_total})\n` +
    lines
  )
}
```

The morning brief now reads accurate structured data.
Zero parsing risk. Zero double-counting.

---

## Types to Add (lib/types.ts)

```typescript
export type LarkBaseConnection = {
  id: string
  created_at: string
  updated_at: string
  name: string
  description: string | null
  base_type: 'sales' | 'viewing' | 'hr' | 'finance' | 'owner' | 'custom'
  app_token: string
  table_id: string
  view_id: string | null
  base_url: string
  field_mapping: Record<string, string>
  reading_rules: Record<string, unknown>
  sync_enabled: boolean
  sync_frequency_minutes: number
  last_synced_at: string | null
  last_sync_status: 'pending' | 'syncing' | 'success' | 'failed'
  last_sync_error: string | null
  last_sync_record_count: number
  total_records_synced: number
  connection_status: 'active' | 'paused' | 'error'
}

export type LarkBaseRecord = {
  id: string
  created_at: string
  connection_id: string
  base_type: string
  lark_record_id: string
  record_date: string | null
  cluster: string | null
  agent_name: string | null
  property_name: string | null
  unit_number: string | null
  category: string | null
  is_virtual: boolean
  status: string | null
  amount: number | null
  raw_fields: Record<string, unknown>
}

export type SalesSummary = {
  cluster: string
  date_from: Date
  date_to: Date
  indoor_total: number
  outdoor_own_total: number
  grand_total: number
  virtual_count: number
  by_agent: Record<string, AgentSales>
}

export type AgentSales = {
  indoor: number
  virtual: number
  outdoor_own?: number
}

export type ViewingSummary = {
  cluster: string
  date: Date
  total: number
  booked: number
  pending: number
  by_agent: Record<string, number>
}
```

---

## Files to Create

```
lib/lark-base-connector.ts            ← core sync + query engine
app/api/bases/route.ts                ← CRUD for connections
app/api/bases/schema/route.ts         ← fetch Base schema
app/api/bases/[id]/route.ts           ← single connection ops
app/api/bases/[id]/sync/route.ts      ← manual sync trigger
app/api/bases/[id]/records/route.ts   ← query records
app/api/cron/base-sync/route.ts       ← scheduled sync

components/bases/ConnectBaseDrawer.tsx ← 3-step connection wizard
components/bases/BaseCard.tsx          ← single Base card
components/bases/LarkBasesSection.tsx  ← section in /groups page
components/clusters/SalesTab.tsx       ← Sales tab in cluster detail
```

## Files to Update

```
app/(dashboard)/groups/page.tsx        ← add Lark Bases section
components/clusters/ClusterDetailPanel.tsx ← add Sales tab
lib/briefings/pre-standup.ts          ← use Base data for sales
lib/types.ts                           ← add new types
vercel.json                            ← add base-sync cron
```

---

## Testing Plan

### Step 1 — Migration
```
supabase db reset && supabase db push
Verify: lark_base_connections table exists
Verify: lark_base_records table exists
Verify: pg_cron job for auto-delete
```

### Step 2 — Test connection
```
POST /api/bases/schema
Body: { base_url: "https://...larksuite.com/base/Un4Cbz...?table=tbl..." }

Verify: returns list of column names from your Sales Base
Should see: Cluster, Closing Date, Created By, Development, etc
```

### Step 3 — Connect Sales Base via UI
```
Open /groups
Click [+ Connect Base]
Paste Sales Base URL
Click [Test Connection] → ✅ Connected
Map fields:
  Cluster → cluster
  Closing Date → record_date
  Created By → agent_name
  Development → property_name
  Sale Type → category
  Virtual → is_virtual
Name: "Tenant Sales Management 2026"
☑ Indoor includes virtual
☑ Total = Indoor + Outdoor Own
Click [Connect Base]

Verify:
  Card appears in Lark Bases section
  Status: Syncing...
  After sync: "847 records · Synced just now"
```

### Step 4 — Verify records
```
In Supabase Studio → lark_base_records:
  Should have rows with base_type = 'sales'
  Check: cluster field populated (C1, C11, etc)
  Check: record_date populated
  Check: category populated (indoor, outdoor_own, etc)
  Check: is_virtual populated where applicable
```

### Step 5 — Sales tab in cluster detail
```
Open /clusters
Click C11 column
Click [📊 Sales] tab
Verify:
  Yesterday's totals show (Indoor + Outdoor Own)
  Per-agent breakdown with virtual notes
  Viewing counts below
  Data source shows "Tenant Sales Management 2026"
  Sync time shown
```

### Step 6 — Morning brief uses Base data
```
curl -X POST http://localhost:3000/api/briefings/send-morning \
  -H "x-nucleus-secret: belive_nucleus_2026" \
  -d '{"clusters": ["C11"]}'

Check the generated brief:
  Sales section shows structured data (not parsed from chat)
  Numbers are correct (no double-counting)
  Virtual noted in brackets
```

### Step 7 — Cron sync
```
curl -X GET http://localhost:3000/api/cron/base-sync \
  -H "x-nucleus-secret: belive_nucleus_2026"

Verify: syncs all enabled connections
Verify: lark_base_connections.last_synced_at updates
```

### Step 8 — Connect Viewing Base
```
Same flow as Sales
Base type: viewing
Map: Date → record_date, Agent → agent_name, Outcome → status

Verify: Viewing summary appears in Sales tab
```

---

## Done Criteria

- [ ] lark_base_connections table created
- [ ] lark_base_records table created with 90-day retention
- [ ] parseLarkBaseUrl() extracts app_token + table_id + view_id
- [ ] fetchBaseSchema() returns columns from Lark Base API
- [ ] fetchBaseRecords() pages through all records
- [ ] mapRecord() applies field mapping correctly
- [ ] syncConnection() syncs all records with upsert
- [ ] syncAllConnections() only syncs due connections
- [ ] Sales reading rules applied (no double-counting)
- [ ] getYesterdaySalesSummary() returns formatted text
- [ ] /groups page has Lark Bases section
- [ ] Connect Base drawer: 3-step flow works end to end
- [ ] Step 1: URL paste + test connection works
- [ ] Step 2: field mapping shows all Base columns
- [ ] Step 3: name + rules configured
- [ ] Base card shows sync status (● green/amber/red)
- [ ] Sync Now button works
- [ ] Cluster detail panel has [📊 Sales] 6th tab
- [ ] Sales tab shows correct totals per reading rules
- [ ] Per-agent breakdown with virtual in brackets
- [ ] Viewing counts shown below sales
- [ ] Date selector works (yesterday/today/week/month)
- [ ] Morning brief reads from Base (not group chat)
- [ ] Cron sync runs every 15 min
- [ ] Can connect second Base (Viewing) same way
- [ ] Zero TypeScript errors
- [ ] Deployed to production
