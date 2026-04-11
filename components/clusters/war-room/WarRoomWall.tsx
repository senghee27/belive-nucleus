'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CategoryHeader } from './CategoryHeader'
import { SituationRow } from './SituationRow'
import { DottedSlot } from './DottedSlot'
import {
  WAR_ROOM_GROUP_ORDER,
  WAR_ROOM_GROUP_LABEL,
  WAR_ROOM_GROUP_LIMIT,
} from '@/lib/types'
import type { WarRoomCluster, WarRoomCategoryBucket, WarRoomRow } from '@/app/api/clusters/war-room/route'

const COLUMN_WIDTH_PX = 440
const REFRESH_INTERVAL_MS = 30_000
const STATUS_DOT: Record<string, string> = {
  red: '#E05252',
  amber: '#E8A838',
  green: '#4BF2A2',
}

/**
 * War-Room Wall — horizontal-scroll 11-column situation board.
 * See docs/features/NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md.
 */
export function WarRoomWall() {
  const router = useRouter()
  const [clusters, setClusters] = useState<WarRoomCluster[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [generatedAt, setGeneratedAt] = useState<string | null>(null)
  const [flashCluster, setFlashCluster] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Fetch war-room feed. Polled every 30s per spec §10.
  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/clusters/war-room', { cache: 'no-store' })
      const d = await res.json()
      if (!res.ok) {
        setError(d.error ?? 'Failed to load war-room')
        return
      }
      setClusters((d.clusters ?? []) as WarRoomCluster[])
      setGeneratedAt(d.generated_at ?? null)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [fetchData])

  const pills = useMemo(
    () => clusters.map(c => ({
      cluster: c.cluster,
      status: c.health_status ?? null,
      // Worst severity across all open rows in this cluster
      worst: worstSeverityForCluster(c),
    })),
    [clusters],
  )

  const scrollToCluster = useCallback((cluster: string) => {
    const el = columnRefs.current.get(cluster)
    if (!el || !scrollRef.current) return
    el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
    setFlashCluster(cluster)
    setTimeout(() => setFlashCluster(null), 900)
  }, [])

  const handleRowClick = useCallback((id: string) => {
    router.push(`/command/${id}`)
  }, [router])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + cluster pills strip */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div>
          <h1 className="text-[18px] font-semibold text-[#E8EEF8]">Cluster Health — War Room</h1>
          <p className="text-[10px] text-[#4B5A7A] mt-0.5">
            Horizontal scroll · 11 clusters · Maintenance top 10 · others top 3
            {generatedAt && (
              <span className="ml-2 text-[#2A3550]">
                · refreshed {new Date(generatedAt).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {pills.map(pill => {
            const dot = STATUS_DOT[pill.worst] ?? STATUS_DOT[pill.status ?? ''] ?? '#4B5A7A'
            return (
              <button
                key={pill.cluster}
                type="button"
                onClick={() => scrollToCluster(pill.cluster)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-semibold text-[#8A9BB8] hover:text-[#F2784B] hover:bg-[#F2784B]/10 transition-colors"
                title={`Scroll to ${pill.cluster}`}
              >
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: dot }}
                />
                {pill.cluster}
              </button>
            )
          })}
        </div>
      </div>

      {/* Loading / error states */}
      {loading && clusters.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#4B5A7A]">
          Loading war-room…
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#E05252]">
          {error}
        </div>
      )}
      {!loading && !error && clusters.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#4B5A7A]">
          No cluster data yet.
        </div>
      )}

      {/* Horizontal-scroll column grid */}
      {clusters.length > 0 && (
        <div
          ref={scrollRef}
          className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden min-h-0 pb-2 war-room-scroll"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {clusters.map(cluster => (
            <WarRoomColumn
              key={cluster.cluster}
              cluster={cluster}
              isFlashing={flashCluster === cluster.cluster}
              registerRef={el => {
                if (el) columnRefs.current.set(cluster.cluster, el)
                else columnRefs.current.delete(cluster.cluster)
              }}
              onRowClick={handleRowClick}
            />
          ))}
          {/* Trailing spacer so the last column scrolls clear of the edge */}
          <div className="shrink-0 w-2" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------
// Column
// --------------------------------------------------------------------

interface WarRoomColumnProps {
  cluster: WarRoomCluster
  isFlashing: boolean
  registerRef: (el: HTMLDivElement | null) => void
  onRowClick: (id: string) => void
}

function WarRoomColumn({ cluster, isFlashing, registerRef, onRowClick }: WarRoomColumnProps) {
  const statusDot = STATUS_DOT[cluster.health_status ?? ''] ?? '#4B5A7A'

  return (
    <div
      ref={registerRef}
      className="shrink-0 flex flex-col rounded-lg border border-[#1A2035] bg-[#0D1525] overflow-hidden transition-shadow"
      style={{
        width: COLUMN_WIDTH_PX,
        scrollSnapAlign: 'start',
        boxShadow: isFlashing ? '0 0 0 2px #F2784B, 0 0 20px rgba(242,120,75,0.4)' : undefined,
      }}
    >
      {/* Column header — cluster code + health dot + optional name */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1A2035] shrink-0">
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ backgroundColor: statusDot }}
        />
        <span className="text-[13px] font-[family-name:var(--font-jetbrains-mono)] font-bold text-[#E8EEF8]">
          {cluster.cluster}
        </span>
        {cluster.cluster_name && cluster.cluster_name !== cluster.cluster && (
          <span className="text-[10px] text-[#4B5A7A] truncate">{cluster.cluster_name}</span>
        )}
      </div>

      {/* Category sections — fixed-band grid per spec §2.
          Every category always renders WAR_ROOM_GROUP_LIMIT[group] slots.
          Real rows fill from the top; unused slots render as DottedSlot
          placeholders so Lee can scan row-by-row horizontally across
          all clusters at predictable vertical positions. strict top-N
          enforcement is handled server-side in the /api/clusters/war-room
          bucketer — this client just trusts bucket.rows is already
          capped to the band limit. */}
      <div className="flex-1 overflow-y-auto px-1">
        {WAR_ROOM_GROUP_ORDER.map(group => {
          const bucket: WarRoomCategoryBucket = cluster[group]
          const label = WAR_ROOM_GROUP_LABEL[group]
          const bandSize = WAR_ROOM_GROUP_LIMIT[group]
          // Defensive: even if the API ever returns more than the
          // band limit, clamp here so the grid never overflows.
          const visibleRows = bucket.rows.slice(0, bandSize)
          const emptySlots = Math.max(0, bandSize - visibleRows.length)
          return (
            <section key={group} className="mb-0.5">
              <CategoryHeader
                label={label}
                total={bucket.total}
                overdue={bucket.overdue}
              />
              <div className="flex flex-col">
                {visibleRows.map(row => (
                  <SituationRow key={row.id} row={row} onClick={onRowClick} />
                ))}
                {Array.from({ length: emptySlots }).map((_, idx) => (
                  <DottedSlot key={`empty-${group}-${idx}`} />
                ))}
              </div>
              {bucket.total > visibleRows.length && (
                <div className="px-2 py-1 text-[9px] text-[#4B5A7A] hover:text-[#F2784B] cursor-pointer transition-colors">
                  +{bucket.total - visibleRows.length} more →
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

// --------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------

function worstSeverityForCluster(cluster: WarRoomCluster): string {
  const allRows: WarRoomRow[] = [
    ...cluster.maintenance.rows,
    ...cluster.cleaning.rows,
    ...cluster.move_in.rows,
    ...cluster.move_out.rows,
    ...cluster.incidents.rows,
  ]
  if (allRows.length === 0) return 'green'
  if (allRows.some(r => r.priority === 'P1')) return 'red'
  if (allRows.some(r => r.priority === 'P2')) return 'amber'
  return 'green'
}
