'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { CategoryHeader } from './CategoryHeader'
import { SituationRow } from './SituationRow'
import { TicketRow } from './TicketRow'
import { DottedSlot } from './DottedSlot'
import { ModeToggle } from './ModeToggle'
import {
  WAR_ROOM_GROUP_LABEL,
  WAR_ROOM_GROUP_LIMIT,
  type Severity,
} from '@/lib/types'
import type {
  WarRoomMode,
  WarRoomResponse,
  WarRoomClusterTickets,
  WarRoomClusterCommand,
  WarRoomTicketBucket,
} from '@/app/api/clusters/war-room/route'

const COLUMN_WIDTH_PX = 440
const REFRESH_INTERVAL_MS = 30_000
const COMMAND_BAND_SLOTS = 18 // fixed-band height for Command mode's single incidents band
const STORAGE_KEY_MODE = 'nucleus_warroom_mode'
const STORAGE_KEY_CLUSTER = 'nucleus_warroom_cluster'

const STATUS_DOT: Record<string, string> = {
  red: '#E05252',
  amber: '#E8A838',
  green: '#4BF2A2',
  overdue: '#E05252',
  due_soon: '#E8A838',
  ontime: '#4BF2A2',
  RED: '#E05252',
  YELLOW: '#E8A838',
  GREEN: '#4BF2A2',
}

// Narrow the discriminated response type at call sites.
function isTicketsResponse(
  r: WarRoomResponse,
): r is Extract<WarRoomResponse, { mode: 'tickets' }> {
  return r.mode === 'tickets'
}

/**
 * War-Room Wall — two-mode horizontal-scroll situation board.
 * See docs/features/NUCLEUS-CLUSTER-HEALTH-WAR-ROOM-SPEC.md.
 */
export function WarRoomWall() {
  const router = useRouter()

  // Mode state — persisted to sessionStorage (matches existing pattern
  // in CommandCenter / ClusterHealthWall / PushPrompt).
  const [mode, setMode] = useState<WarRoomMode>('tickets')
  const [modeHydrated, setModeHydrated] = useState(false)

  const [data, setData] = useState<WarRoomResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [flashCluster, setFlashCluster] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const columnRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Scroll state carried across mode toggles so the commander doesn't
  // lose their place. sessionStorage handles full-page-reload persistence;
  // the ref handles the in-component toggle preservation (which must
  // survive a data refetch and a re-render).
  const pendingRestore = useRef<{ scrollLeft: number; cluster: string | null } | null>(null)

  // Hydrate mode from sessionStorage on mount — gate the first fetch
  // behind this so we don't double-fetch.
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(STORAGE_KEY_MODE)
      if (stored === 'tickets' || stored === 'command') {
        setMode(stored)
      }
    } catch {
      // sessionStorage can throw in private-browsing modes — default is fine
    }
    setModeHydrated(true)
  }, [])

  const fetchData = useCallback(async (nextMode: WarRoomMode) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/clusters/war-room?mode=${nextMode}`, { cache: 'no-store' })
      const d = (await res.json()) as WarRoomResponse & { error?: string }
      if (!res.ok || 'error' in d && d.error) {
        setError(d.error ?? 'Failed to load war-room')
        return
      }
      setData(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
    } finally {
      setLoading(false)
    }
  }, [])

  // Initial + polling fetches. Re-keyed on mode so a toggle refetches.
  useEffect(() => {
    if (!modeHydrated) return
    fetchData(mode)
    const interval = setInterval(() => fetchData(mode), REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [mode, modeHydrated, fetchData])

  // After a mode switch's data lands, restore scroll + target cluster
  // so the commander's place on the wall is preserved.
  useEffect(() => {
    if (!data) return
    const restore = pendingRestore.current
    if (!restore) return
    pendingRestore.current = null
    // Schedule on the next frame so newly-rendered columns are in the DOM.
    requestAnimationFrame(() => {
      if (!scrollRef.current) return
      if (restore.cluster) {
        const el = columnRefs.current.get(restore.cluster)
        if (el) {
          el.scrollIntoView({ block: 'nearest', inline: 'start', behavior: 'auto' })
          return
        }
      }
      scrollRef.current.scrollLeft = restore.scrollLeft
    })
  }, [data])

  const handleModeChange = useCallback((next: WarRoomMode) => {
    if (next === mode) return
    // Snapshot scroll state BEFORE the data swap wipes the column DOM.
    const scrollLeft = scrollRef.current?.scrollLeft ?? 0
    let activeCluster: string | null = null
    if (scrollRef.current) {
      const scrollX = scrollRef.current.scrollLeft
      // Find the leftmost visible column (whose left edge is closest to 0)
      let bestDistance = Infinity
      for (const [code, el] of columnRefs.current.entries()) {
        const distance = Math.abs(el.offsetLeft - scrollX)
        if (distance < bestDistance) {
          bestDistance = distance
          activeCluster = code
        }
      }
    }
    pendingRestore.current = { scrollLeft, cluster: activeCluster }
    try {
      sessionStorage.setItem(STORAGE_KEY_MODE, next)
      if (activeCluster) sessionStorage.setItem(STORAGE_KEY_CLUSTER, activeCluster)
    } catch {
      // ignore — sessionStorage is best-effort
    }
    setMode(next)
  }, [mode])

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

  // Build the cluster-pill strip metadata. Severity dots recompute
  // per mode — spec §2.1 — so flipping the toggle always re-colors
  // pills to reflect "what's hot in the view I'm looking at".
  const pills = useMemo(() => {
    if (!data) return [] as Array<{ cluster: string; color: string }>
    if (isTicketsResponse(data)) {
      return data.clusters.map(c => ({
        cluster: c.cluster,
        color: STATUS_DOT[c.worst_sla ?? ''] ?? '#4B5A7A',
      }))
    }
    return data.clusters.map(c => ({
      cluster: c.cluster,
      color: STATUS_DOT[c.worst_severity ?? ''] ?? '#4B5A7A',
    }))
  }, [data])

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Header + mode toggle + cluster pills strip */}
      <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <ModeToggle mode={mode} onChange={handleModeChange} />
          <div className="min-w-0">
            <h1 className="text-[16px] font-semibold text-[#E8EEF8] leading-tight">Cluster Health — War Room</h1>
            <p className="text-[10px] text-[#4B5A7A] mt-0.5 truncate">
              {mode === 'tickets'
                ? 'Operational pipeline · 4 bands · Maintenance top 10'
                : 'Triage stream · attention_required only · severity-first'}
              {data && (
                <span className="ml-2 text-[#2A3550]">
                  · refreshed {new Date(data.generated_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {pills.map(pill => (
            <button
              key={pill.cluster}
              type="button"
              onClick={() => scrollToCluster(pill.cluster)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-semibold text-[#8A9BB8] hover:text-[#F2784B] hover:bg-[#F2784B]/10 transition-colors"
              title={`Scroll to ${pill.cluster}`}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full"
                style={{ backgroundColor: pill.color }}
              />
              {pill.cluster}
            </button>
          ))}
        </div>
      </div>

      {/* Loading / error / empty states */}
      {loading && !data && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#4B5A7A]">
          Loading {mode} mode…
        </div>
      )}
      {error && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#E05252]">
          {error}
        </div>
      )}
      {!loading && !error && data && data.clusters.length === 0 && (
        <div className="flex-1 flex items-center justify-center text-[12px] text-[#4B5A7A]">
          No cluster data yet.
        </div>
      )}

      {/* Horizontal-scroll column grid */}
      {data && data.clusters.length > 0 && (
        <div
          ref={scrollRef}
          className="flex-1 flex gap-3 overflow-x-auto overflow-y-hidden min-h-0 pb-2 war-room-scroll"
          style={{ scrollSnapType: 'x proximity' }}
        >
          {isTicketsResponse(data)
            ? data.clusters.map(cluster => (
                <TicketsColumn
                  key={cluster.cluster}
                  cluster={cluster}
                  isFlashing={flashCluster === cluster.cluster}
                  registerRef={el => {
                    if (el) columnRefs.current.set(cluster.cluster, el)
                    else columnRefs.current.delete(cluster.cluster)
                  }}
                  onRowClick={handleRowClick}
                />
              ))
            : data.clusters.map(cluster => (
                <CommandColumn
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
          <div className="shrink-0 w-2" aria-hidden="true" />
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Tickets mode column — 4 fixed bands
// ---------------------------------------------------------------------------

const TICKETS_BAND_ORDER: Array<{ key: 'maintenance' | 'cleaning' | 'move_in' | 'move_out'; label: string }> = [
  { key: 'maintenance', label: WAR_ROOM_GROUP_LABEL.maintenance },
  { key: 'cleaning', label: WAR_ROOM_GROUP_LABEL.cleaning },
  { key: 'move_in', label: WAR_ROOM_GROUP_LABEL.move_in },
  { key: 'move_out', label: WAR_ROOM_GROUP_LABEL.move_out },
]

interface TicketsColumnProps {
  cluster: WarRoomClusterTickets
  isFlashing: boolean
  registerRef: (el: HTMLDivElement | null) => void
  onRowClick: (id: string) => void
}

function TicketsColumn({ cluster, isFlashing, registerRef, onRowClick }: TicketsColumnProps) {
  const pillDot = STATUS_DOT[cluster.worst_sla ?? ''] ?? '#4B5A7A'

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
      <ColumnHeader
        cluster={cluster.cluster}
        clusterName={cluster.cluster_name}
        dotColor={pillDot}
      />
      <div className="flex-1 overflow-y-auto px-1">
        {TICKETS_BAND_ORDER.map(({ key, label }) => {
          const bucket: WarRoomTicketBucket = cluster[key]
          const bandSize = WAR_ROOM_GROUP_LIMIT[key]
          const visibleRows = bucket.rows.slice(0, bandSize)
          const emptySlots = Math.max(0, bandSize - visibleRows.length)
          return (
            <section key={key} className="mb-0.5">
              <CategoryHeader label={label} total={bucket.total} overdue={bucket.overdue} />
              <div className="flex flex-col">
                {visibleRows.map(row => (
                  <TicketRow key={row.id} row={row} onClick={onRowClick} />
                ))}
                {Array.from({ length: emptySlots }).map((_, idx) => (
                  <DottedSlot key={`empty-${key}-${idx}`} />
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

// ---------------------------------------------------------------------------
// Command mode column — single Incidents band
// ---------------------------------------------------------------------------

interface CommandColumnProps {
  cluster: WarRoomClusterCommand
  isFlashing: boolean
  registerRef: (el: HTMLDivElement | null) => void
  onRowClick: (id: string) => void
}

function CommandColumn({ cluster, isFlashing, registerRef, onRowClick }: CommandColumnProps) {
  const dotColor = dotFromSeverity(cluster.worst_severity)
  const bucket = cluster.incidents
  const visibleRows = bucket.rows.slice(0, COMMAND_BAND_SLOTS)
  const emptySlots = Math.max(0, COMMAND_BAND_SLOTS - visibleRows.length)

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
      <ColumnHeader
        cluster={cluster.cluster}
        clusterName={cluster.cluster_name}
        dotColor={dotColor}
      />
      <div className="flex-1 overflow-y-auto px-1">
        <section className="mb-0.5">
          <CategoryHeader
            label="Attention Required"
            total={bucket.total}
            overdue={bucket.overdue}
          />
          <div className="flex flex-col">
            {visibleRows.map(row => (
              <SituationRow key={row.id} row={row} onClick={onRowClick} />
            ))}
            {Array.from({ length: emptySlots }).map((_, idx) => (
              <DottedSlot key={`empty-cmd-${idx}`} />
            ))}
          </div>
          {bucket.total > visibleRows.length && (
            <div className="px-2 py-1 text-[9px] text-[#4B5A7A] hover:text-[#F2784B] cursor-pointer transition-colors">
              +{bucket.total - visibleRows.length} more →
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

function ColumnHeader({ cluster, clusterName, dotColor }: { cluster: string; clusterName: string | null; dotColor: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 border-b border-[#1A2035] shrink-0">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <span className="text-[13px] font-[family-name:var(--font-jetbrains-mono)] font-bold text-[#E8EEF8]">
        {cluster}
      </span>
      {clusterName && clusterName !== cluster && (
        <span className="text-[10px] text-[#4B5A7A] truncate">{clusterName}</span>
      )}
    </div>
  )
}

function dotFromSeverity(sev: Severity | null): string {
  if (sev === 'RED') return '#E05252'
  if (sev === 'YELLOW') return '#E8A838'
  if (sev === 'GREEN') return '#4BF2A2'
  return '#4B5A7A'
}
