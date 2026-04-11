import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sortClustersNatural } from '@/lib/clusters/sort'
import {
  categoryGroup,
  WAR_ROOM_GROUP_LIMIT,
  WAR_ROOM_GROUP_ORDER,
  type WarRoomCategoryGroup,
} from '@/lib/types'
import type { Incident, Priority, Severity } from '@/lib/types'

export const dynamic = 'force-dynamic'

// Slim row shape — only the fields the war-room view renders, so
// the API response stays under a few KB even with all 11 clusters.
export type WarRoomRow = {
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
  status: string
}

export type WarRoomCategoryBucket = {
  rows: WarRoomRow[]     // truncated to WAR_ROOM_GROUP_LIMIT[group]
  total: number          // total open in this (cluster, group)
  overdue: number        // escalation_due_at < now AND !escalated
}

export type WarRoomCluster = {
  cluster: string
  cluster_name: string | null
  health_status: string | null
  maintenance: WarRoomCategoryBucket
  cleaning: WarRoomCategoryBucket
  move_in: WarRoomCategoryBucket
  move_out: WarRoomCategoryBucket
  incidents: WarRoomCategoryBucket
}

const OPEN_STATUSES = ['new', 'analysed', 'awaiting_lee', 'acting'] as const

function isOverdue(row: Pick<Incident, 'escalation_due_at' | 'escalated'>): boolean {
  if (!row.escalation_due_at) return false
  if (row.escalated) return false
  return new Date(row.escalation_due_at).getTime() < Date.now()
}

/**
 * Worst-first priority/severity ordering used to pick the top-N rows
 * per (cluster, group). Unclassified rows always sort first so Lee
 * sees them immediately — amber fallbacks are the most urgent
 * review-by-human signal.
 */
function compareRows(a: WarRoomRow, b: WarRoomRow): number {
  // 1. Unclassified first
  const aUnclassified = !a.is_classified ? 0 : 1
  const bUnclassified = !b.is_classified ? 0 : 1
  if (aUnclassified !== bUnclassified) return aUnclassified - bUnclassified

  // 2. Overdue first
  const aOverdue = isOverdue(a) ? 0 : 1
  const bOverdue = isOverdue(b) ? 0 : 1
  if (aOverdue !== bOverdue) return aOverdue - bOverdue

  // 3. Priority (P1 < P2 < P3)
  const prRank: Record<Priority, number> = { P1: 0, P2: 1, P3: 2 }
  const pa = prRank[a.priority] ?? 3
  const pb = prRank[b.priority] ?? 3
  if (pa !== pb) return pa - pb

  // 4. Severity (RED < YELLOW < GREEN)
  const sevRank: Record<Severity, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
  const sa = sevRank[a.severity] ?? 3
  const sb = sevRank[b.severity] ?? 3
  if (sa !== sb) return sa - sb

  // 5. Oldest first (longest-open rows bubble up)
  return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
}

function emptyBucket(): WarRoomCategoryBucket {
  return { rows: [], total: 0, overdue: 0 }
}

function emptyCluster(cluster: string, name: string | null, health: string | null): WarRoomCluster {
  return {
    cluster,
    cluster_name: name,
    health_status: health,
    maintenance: emptyBucket(),
    cleaning: emptyBucket(),
    move_in: emptyBucket(),
    move_out: emptyBucket(),
    incidents: emptyBucket(),
  }
}

export async function GET() {
  // 1. Cluster metadata (name + rollup health) from cluster_health_cache.
  //    If the cache is empty (fresh install) the war-room can still render
  //    off the incidents table alone.
  const { data: healthRows } = await supabaseAdmin
    .from('cluster_health_cache')
    .select('cluster, cluster_name, health_status')

  const healthByCluster = new Map<string, { name: string | null; status: string | null }>()
  for (const h of healthRows ?? []) {
    healthByCluster.set(h.cluster as string, {
      name: (h.cluster_name as string) ?? null,
      status: (h.health_status as string) ?? null,
    })
  }

  // 2. All open incidents — one query, partitioned in-memory. At
  //    realistic volumes (~20 open per cluster × 11 clusters = 220 rows)
  //    this is cheaper than 11 parallel queries.
  const { data: rowsRaw, error } = await supabaseAdmin
    .from('incidents')
    .select(`
      id, cluster, title, priority, severity, category, created_at,
      escalation_due_at, escalated, situation_summary, is_classified,
      raw_lark_text, sender_name, sender_open_id, assigned_to, status
    `)
    .in('status', OPEN_STATUSES as unknown as string[])
    .order('created_at', { ascending: false })
    .limit(1500)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (rowsRaw ?? []) as Array<WarRoomRow & { cluster: string | null }>

  // 3. Bucket rows into (cluster → group) map.
  //    We keep ALL rows per bucket so total/overdue counts reflect the
  //    real open population, not the top-N truncation.
  const byCluster = new Map<string, Record<WarRoomCategoryGroup, WarRoomRow[]>>()
  for (const row of rows) {
    if (!row.cluster) continue
    const group = categoryGroup(row.category)
    let buckets = byCluster.get(row.cluster)
    if (!buckets) {
      buckets = { maintenance: [], cleaning: [], move_in: [], move_out: [], incidents: [] }
      byCluster.set(row.cluster, buckets)
    }
    buckets[group].push(row)
  }

  // 4. Assemble the final cluster list. Include every cluster that has
  //    a cluster_health_cache row (so empty clusters still render a
  //    column with zeros) plus any cluster that appears only in the
  //    incidents table (defensive against cache drift).
  const allClusterCodes = new Set<string>([
    ...healthByCluster.keys(),
    ...byCluster.keys(),
  ])

  const clusters: WarRoomCluster[] = [...allClusterCodes].map(code => {
    const meta = healthByCluster.get(code)
    const shell = emptyCluster(code, meta?.name ?? null, meta?.status ?? null)
    const buckets = byCluster.get(code)
    if (!buckets) return shell

    for (const group of WAR_ROOM_GROUP_ORDER) {
      const groupRows = buckets[group]
      const sorted = [...groupRows].sort(compareRows)
      shell[group] = {
        rows: sorted.slice(0, WAR_ROOM_GROUP_LIMIT[group]),
        total: groupRows.length,
        overdue: groupRows.filter(isOverdue).length,
      }
    }
    return shell
  })

  const sorted = sortClustersNatural(clusters, c => c.cluster)

  return NextResponse.json({
    clusters: sorted,
    generated_at: new Date().toISOString(),
  })
}
