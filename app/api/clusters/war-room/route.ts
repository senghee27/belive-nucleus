import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sortClustersNatural } from '@/lib/clusters/sort'
import { getAllStaff, sanitizeOwnerLabel, type StaffMember } from '@/lib/staff-directory'
import {
  categoryGroup,
  WAR_ROOM_GROUP_LIMIT,
  WAR_ROOM_GROUP_ORDER,
  type WarRoomCategoryGroup,
} from '@/lib/types'
import type { Priority, Severity } from '@/lib/types'

export const dynamic = 'force-dynamic'

// ---------------------------------------------------------------------------
// War-Room API — two-mode response.
//
// ?mode=tickets  → operational pipeline from ai_report_tickets (4 bands,
//                  1-line rows, overdue-first sort, ai_summary on hover)
// ?mode=command  → triage stream from incidents WHERE attention_required
//                  AND ticket_id IS NULL (single band, 2-line rows,
//                  severity→recency sort, amber fallback for unclassified)
//
// The two modes never share rows: Command excludes any incident linked
// to a ticket so the "same issue" can't appear in both views. Tickets
// come from the ai_report Lark group parser path; regular cluster chat
// produces incidents. The webhook already routes these into separate
// tables — this API just honors that separation.
// ---------------------------------------------------------------------------

export type WarRoomMode = 'tickets' | 'command'

// -------- Shared row metadata --------

// Incident-shaped row (Command mode). Owner pre-resolved server-side.
export type WarRoomIncidentRow = {
  id: string
  title: string
  priority: Priority
  severity: Severity
  category: string
  created_at: string
  escalation_due_at: string | null
  escalated: boolean
  situation_summary: string | null
  is_classified: boolean
  raw_lark_text: string | null
  sender_name: string | null
  sender_open_id: string | null
  assigned_to: string | null
  owner_display: string
  status: string
}

// Ticket-shaped row (Tickets mode). Pre-derived category + pre-resolved owner.
//
// `title` is the AI-generated situation_line in the shape
// `{what is broken, where} · {blocker or state}`. See
// lib/tickets/situation-line.ts for the generator. If the generator
// hasn't run yet (brand-new ticket, pre-migration DB) the API falls
// back to a "{short description} · no update" stub so the row still
// renders usable text instead of going blank.
//
// `hover_description` carries the full human issue_description for
// the detail panel / hover tooltip.
export type WarRoomTicketRow = {
  id: string
  ticket_id: string                // BLV-RQ-XXXXXX
  title: string                    // ai_situation_line (or defensive fallback)
  hover_description: string | null // full issue_description for hover tooltip
  category: string                 // derived from issue_description text
  sla_date: string | null          // date string ("2026-04-15")
  // Synthetic timestamp the shared OverduePill can read as
  // escalation_due_at — end-of-day UTC of sla_date.
  sla_due_at: string | null
  sla_overdue: boolean
  age_days: number
  owner_display: string
  property: string | null
  unit_number: string | null
  cluster: string
  // Severity derived from SLA state — 'RED' = overdue, 'YELLOW' = <24h, 'GREEN' = otherwise
  severity: Severity
}

// -------- Bucket + cluster shapes per mode --------

export type WarRoomTicketBucket = {
  rows: WarRoomTicketRow[]
  total: number
  overdue: number
}

export type WarRoomIncidentBucket = {
  rows: WarRoomIncidentRow[]
  total: number
  overdue: number
}

export type WarRoomClusterTickets = {
  cluster: string
  cluster_name: string | null
  worst_sla: 'overdue' | 'due_soon' | 'ontime' | null
  maintenance: WarRoomTicketBucket
  cleaning: WarRoomTicketBucket
  move_in: WarRoomTicketBucket
  move_out: WarRoomTicketBucket
}

// Command mode has a single band (incidents) per cluster.
const COMMAND_BAND_LIMIT = 20

export type WarRoomClusterCommand = {
  cluster: string
  cluster_name: string | null
  worst_severity: Severity | null
  incidents: WarRoomIncidentBucket
}

export type WarRoomResponse =
  | {
      mode: 'tickets'
      clusters: WarRoomClusterTickets[]
      generated_at: string
    }
  | {
      mode: 'command'
      clusters: WarRoomClusterCommand[]
      generated_at: string
    }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const OPEN_INCIDENT_STATUSES = ['new', 'analysed', 'awaiting_lee', 'acting'] as const

async function buildStaffIndex(): Promise<Map<string, StaffMember>> {
  try {
    const staff = await getAllStaff()
    return new Map(staff.map(s => [s.open_id, s]))
  } catch (err) {
    console.error('[war-room:staff-index]', err instanceof Error ? err.message : 'Unknown')
    return new Map()
  }
}

async function loadClusterMeta(): Promise<Map<string, { name: string | null; status: string | null }>> {
  const { data } = await supabaseAdmin
    .from('cluster_health_cache')
    .select('cluster, cluster_name, health_status')
  const map = new Map<string, { name: string | null; status: string | null }>()
  for (const row of data ?? []) {
    map.set(row.cluster as string, {
      name: (row.cluster_name as string) ?? null,
      status: (row.health_status as string) ?? null,
    })
  }
  return map
}

/**
 * Derive a war-room category from a ticket's issue_description text.
 * ai_report_tickets has no explicit category column — the Livability
 * Report is free-text so this is best-effort keyword matching.
 * Returns one of the raw ISSUE_CATEGORIES keys so downstream
 * categoryGroup() can bucket it.
 */
function deriveTicketCategory(description: string): string {
  const text = description.toLowerCase()
  if (/\b(aircond|air[- ]?con|a\/?c|cooling)\b/.test(text)) return 'air_con'
  if (/\b(leak|bocor|pipe|paip|water|plumb|pipa|drain)/.test(text)) return 'plumbing'
  if (/\b(electric|lampu|socket|wiring|power|switch|mcb|trip)/.test(text)) return 'electrical'
  if (/\b(lift|elevator)/.test(text)) return 'lift'
  if (/\b(water[- ]?heater|heater|hot water)/.test(text)) return 'water_heater'
  if (/\b(door|lock|access[- ]?card|card reader|key)/.test(text)) return 'door_lock'
  if (/\b(structural|wall|ceiling|crack|collapse|tile|floor)/.test(text)) return 'structural'
  if (/\b(pest|cockroach|rat|mice|insect|bug|termite)/.test(text)) return 'pest'
  if (/\b(clean|dirty|stain|smell|filthy)/.test(text)) return 'cleaning'
  if (/\b(hygiene|trash|waste|garbage|rubbish|bin)/.test(text)) return 'hygiene'
  if (/\b(move[- ]?in|check[- ]?in|onboard)/.test(text)) return 'move_in'
  if (/\b(move[- ]?out|check[- ]?out|handover)/.test(text)) return 'move_out'
  return 'general_repair'
}

function deriveTicketSeverity(sla_overdue: boolean, sla_due_at: string | null): Severity {
  if (sla_overdue) return 'RED'
  if (sla_due_at) {
    const ms = new Date(sla_due_at).getTime() - Date.now()
    if (ms > 0 && ms < 24 * 3600 * 1000) return 'YELLOW'
  }
  return 'GREEN'
}

function ownerDisplayForIncident(
  row: { assigned_to: string | null; sender_open_id: string | null; sender_name: string | null },
  staffIndex: Map<string, StaffMember>,
): string {
  if (row.assigned_to) {
    const clean = sanitizeOwnerLabel(row.assigned_to)
    if (clean !== '— unknown') return clean
  }
  if (row.sender_open_id) {
    const match = staffIndex.get(row.sender_open_id)
    if (match) return match.first_name || sanitizeOwnerLabel(match.name)
  }
  return sanitizeOwnerLabel(row.sender_name)
}

function ownerDisplayForTicket(owner_name: string | null | undefined): string {
  // ai_report_tickets.owner_name is parsed from the Livability Report
  // free-text, so raw open_ids are extremely unlikely. Still route
  // through sanitizeOwnerLabel for consistency.
  return sanitizeOwnerLabel(owner_name ?? null)
}

// ---------------------------------------------------------------------------
// Mode: Tickets
// ---------------------------------------------------------------------------

async function buildTicketsResponse(
  meta: Map<string, { name: string | null; status: string | null }>,
): Promise<WarRoomResponse> {
  const { data: ticketsRaw, error } = await supabaseAdmin
    .from('ai_report_tickets')
    .select(`
      id, ticket_id, issue_description, summary, owner_name,
      property, cluster, unit_number, age_days, sla_date, sla_overdue, status,
      ai_situation_line
    `)
    .eq('status', 'open')
    .order('sla_overdue', { ascending: false })
    .order('age_days', { ascending: false })
    .limit(1500)

  if (error) {
    throw new Error(`tickets query: ${error.message}`)
  }

  const rows = (ticketsRaw ?? []) as Array<{
    id: string
    ticket_id: string
    issue_description: string | null
    summary: string | null
    owner_name: string | null
    property: string | null
    cluster: string | null
    unit_number: string | null
    age_days: number | null
    sla_date: string | null
    sla_overdue: boolean | null
    status: string
    ai_situation_line: string | null
  }>

  // Project + bucket by cluster + category group
  const byCluster = new Map<string, Record<WarRoomCategoryGroup, WarRoomTicketRow[]>>()
  for (const t of rows) {
    if (!t.cluster) continue
    const description = (t.issue_description ?? '').trim()
    if (!description && !t.summary) continue
    const category = deriveTicketCategory(description || (t.summary ?? ''))
    const group = categoryGroup(category)
    // Tickets mode has only 4 bands — skip anything that'd go into
    // the "incidents" bucket (which belongs to Command mode).
    if (group === 'incidents') continue

    const slaDueAt = t.sla_date ? new Date(`${t.sla_date}T23:59:59Z`).toISOString() : null
    const severity = deriveTicketSeverity(Boolean(t.sla_overdue), slaDueAt)
    // Title priority: LLM-generated situation line → defensive
    // "{truncated human text} · no update" → bare ticket_id. The
    // generator runs during upsertTickets and the backfill script,
    // so any row without ai_situation_line is either pre-backfill
    // legacy data or a ticket that failed generation. Render a
    // readable stub rather than going blank.
    const situationLine = (t.ai_situation_line ?? '').trim()
    let title: string
    if (situationLine) {
      title = situationLine
    } else {
      const stub = (t.summary ?? description ?? t.ticket_id).trim().split(/[.·]/)[0].slice(0, 100)
      title = stub ? `${stub} · no update` : `${t.ticket_id} · no update`
    }

    const ticketRow: WarRoomTicketRow = {
      id: t.id,
      ticket_id: t.ticket_id,
      title,
      hover_description: description || t.summary || null,
      category,
      sla_date: t.sla_date ?? null,
      sla_due_at: slaDueAt,
      sla_overdue: Boolean(t.sla_overdue),
      age_days: Number(t.age_days ?? 0),
      owner_display: ownerDisplayForTicket(t.owner_name),
      property: t.property ?? null,
      unit_number: t.unit_number ?? null,
      cluster: t.cluster,
      severity,
    }

    let buckets = byCluster.get(t.cluster)
    if (!buckets) {
      buckets = { maintenance: [], cleaning: [], move_in: [], move_out: [], incidents: [] }
      byCluster.set(t.cluster, buckets)
    }
    buckets[group].push(ticketRow)
  }

  // Union of clusters from meta + from tickets
  const allClusterCodes = new Set<string>([
    ...meta.keys(),
    ...byCluster.keys(),
  ])

  const clusters: WarRoomClusterTickets[] = [...allClusterCodes].map(code => {
    const clusterMeta = meta.get(code)
    const buckets = byCluster.get(code)
    const shell: WarRoomClusterTickets = {
      cluster: code,
      cluster_name: clusterMeta?.name ?? null,
      worst_sla: null,
      maintenance: { rows: [], total: 0, overdue: 0 },
      cleaning: { rows: [], total: 0, overdue: 0 },
      move_in: { rows: [], total: 0, overdue: 0 },
      move_out: { rows: [], total: 0, overdue: 0 },
    }
    if (!buckets) return shell

    let anyOverdue = false
    let anyDueSoon = false
    for (const group of ['maintenance', 'cleaning', 'move_in', 'move_out'] as const) {
      const groupRows = buckets[group]
      // Already sorted by overdue-first/age-desc thanks to the DB order().
      const capped = groupRows.slice(0, WAR_ROOM_GROUP_LIMIT[group])
      const overdue = groupRows.filter(r => r.sla_overdue).length
      if (overdue > 0) anyOverdue = true
      if (groupRows.some(r => r.severity === 'YELLOW')) anyDueSoon = true
      shell[group] = {
        rows: capped,
        total: groupRows.length,
        overdue,
      }
    }
    shell.worst_sla = anyOverdue ? 'overdue' : anyDueSoon ? 'due_soon' : 'ontime'
    return shell
  })

  return {
    mode: 'tickets',
    clusters: sortClustersNatural(clusters, c => c.cluster),
    generated_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// Mode: Command
// ---------------------------------------------------------------------------

function compareCommandRows(a: WarRoomIncidentRow, b: WarRoomIncidentRow): number {
  // 1. Unclassified first (amber fallback — needs triage)
  const aUnclassified = !a.is_classified ? 0 : 1
  const bUnclassified = !b.is_classified ? 0 : 1
  if (aUnclassified !== bUnclassified) return aUnclassified - bUnclassified
  // 2. Severity (RED > YELLOW > GREEN)
  const sevRank: Record<Severity, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
  const sa = sevRank[a.severity] ?? 3
  const sb = sevRank[b.severity] ?? 3
  if (sa !== sb) return sa - sb
  // 3. Priority
  const prRank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 }
  const pa = prRank[a.priority] ?? 3
  const pb = prRank[b.priority] ?? 3
  if (pa !== pb) return pa - pb
  // 4. Recency — newest first
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
}

function worstSeverityAcrossRows(rows: WarRoomIncidentRow[]): Severity | null {
  if (rows.length === 0) return null
  if (rows.some(r => r.severity === 'RED' || r.priority === 'P1')) return 'RED'
  if (rows.some(r => r.severity === 'YELLOW' || r.priority === 'P2')) return 'YELLOW'
  return 'GREEN'
}

async function buildCommandResponse(
  meta: Map<string, { name: string | null; status: string | null }>,
  staffIndex: Map<string, StaffMember>,
): Promise<WarRoomResponse> {
  const { data: rowsRaw, error } = await supabaseAdmin
    .from('incidents')
    .select(`
      id, cluster, title, priority, severity, category, created_at,
      escalation_due_at, escalated, situation_summary, is_classified,
      raw_lark_text, sender_name, sender_open_id, assigned_to, status,
      ticket_id, attention_required
    `)
    .in('status', OPEN_INCIDENT_STATUSES as unknown as string[])
    .eq('attention_required', true)
    // Dedup: tickets are canonical when linked. The cross-group
    // intelligence pipeline creates incidents for silent tickets
    // and sets incidents.ticket_id — those show up in Tickets mode,
    // never in Command mode.
    .is('ticket_id', null)
    .order('created_at', { ascending: false })
    .limit(1500)

  if (error) {
    throw new Error(`command query: ${error.message}`)
  }

  const rawRows = (rowsRaw ?? []) as Array<Omit<WarRoomIncidentRow, 'owner_display'> & { cluster: string | null }>
  const rows: Array<WarRoomIncidentRow & { cluster: string | null }> = rawRows.map(row => ({
    ...row,
    owner_display: ownerDisplayForIncident(row, staffIndex),
  }))

  const byCluster = new Map<string, WarRoomIncidentRow[]>()
  for (const row of rows) {
    if (!row.cluster) continue
    const list = byCluster.get(row.cluster) ?? []
    list.push(row)
    byCluster.set(row.cluster, list)
  }

  const allClusterCodes = new Set<string>([
    ...meta.keys(),
    ...byCluster.keys(),
  ])

  const clusters: WarRoomClusterCommand[] = [...allClusterCodes].map(code => {
    const clusterMeta = meta.get(code)
    const shell: WarRoomClusterCommand = {
      cluster: code,
      cluster_name: clusterMeta?.name ?? null,
      worst_severity: null,
      incidents: { rows: [], total: 0, overdue: 0 },
    }
    const clusterRows = byCluster.get(code)
    if (!clusterRows || clusterRows.length === 0) return shell

    const sorted = [...clusterRows].sort(compareCommandRows)
    const capped = sorted.slice(0, COMMAND_BAND_LIMIT)
    const overdue = clusterRows.filter(r => {
      if (!r.escalation_due_at || r.escalated) return false
      return new Date(r.escalation_due_at).getTime() < Date.now()
    }).length

    shell.incidents = {
      rows: capped,
      total: clusterRows.length,
      overdue,
    }
    shell.worst_severity = worstSeverityAcrossRows(sorted)
    return shell
  })

  return {
    mode: 'command',
    clusters: sortClustersNatural(clusters, c => c.cluster),
    generated_at: new Date().toISOString(),
  }
}

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const modeParam = url.searchParams.get('mode')
  const mode: WarRoomMode = modeParam === 'command' ? 'command' : 'tickets'

  try {
    const meta = await loadClusterMeta()

    if (mode === 'tickets') {
      const response = await buildTicketsResponse(meta)
      return NextResponse.json(response)
    }

    const staffIndex = await buildStaffIndex()
    const response = await buildCommandResponse(meta, staffIndex)
    return NextResponse.json(response)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown'
    console.error('[war-room]', mode, message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
