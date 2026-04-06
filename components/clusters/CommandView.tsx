'use client'

import { useState } from 'react'
import { RotateCw } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type TicketItem = { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }

function getAgeColor(ageDays: number): string {
  if (ageDays > 60) return '#E05252'
  if (ageDays > 30) return '#E8A838'
  return '#4B5A7A'
}

const CAT_ICONS: Record<string, string> = { maintenance: '🔧', cleaning: '🧹', move_in: '→', move_out: '↺' }

function OVRBadge() {
  return <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] px-1 py-px rounded border border-[#E05252] bg-[#E05252]/10 text-[#E05252]">OVR</span>
}

function BlockerRow({ blocker, isLast }: { blocker: TicketItem; isLast: boolean }) {
  return (
    <div className={`py-2 ${!isLast ? 'border-b border-[#1A2035]' : ''} ${blocker.age_days > 90 ? 'bg-[rgba(224,82,82,0.04)]' : ''}`}>
      <div className="flex items-center gap-1.5 mb-0.5">
        <span className="text-[12px]">{CAT_ICONS[blocker.category] ?? '❓'}</span>
        <span className="text-[12px] font-medium text-[#E8EEF8] truncate flex-1">{blocker.title}</span>
        <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] shrink-0" style={{ color: getAgeColor(blocker.age_days) }}>{blocker.age_days}d</span>
        {blocker.sla_overdue && <OVRBadge />}
      </div>
      <div className="text-[11px] text-[#8A9BB8] pl-[18px]">
        {blocker.owner_name}{blocker.unit && blocker.unit !== '—' ? ` · ${blocker.unit}` : ''}
      </div>
    </div>
  )
}

function CountPill({ icon, count, overdue }: { icon: string; count: number; overdue: number }) {
  const color = overdue > 0 ? '#E05252' : count > 0 ? '#E8EEF8' : '#4B5A7A'
  return (
    <div className="flex items-center gap-1">
      <span className="text-[11px]">{icon}</span>
      <span className="text-[11px] font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{count}</span>
      {overdue > 0 && <span className="text-[9px] text-[#E05252]">{overdue}!</span>}
    </div>
  )
}

export function CommandView({ data, onMoreClick }: {
  data: {
    cluster: string
    ai_summary: string | null
    ai_summary_generated_at: string | null
    top_blockers: TicketItem[]
    maintenance_total: number; maintenance_overdue: number
    cleaning_total: number; cleaning_overdue: number
    move_in_pending: number; move_in_overdue: number
    turnaround_total: number; turnaround_breach: number
  }
  onMoreClick: (cluster: string, category: string) => void
}) {
  const [refreshing, setRefreshing] = useState(false)

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await fetch(`/api/clusters/${data.cluster}/refresh-summary`, { method: 'POST' })
    } catch { /* ignore */ }
    finally { setTimeout(() => setRefreshing(false), 2000) }
  }

  return (
    <div className="h-full flex flex-col px-2 py-2">
      {/* AI Summary */}
      <div className="bg-[#080E1C] rounded-lg border border-[#1A2035] p-2.5 mb-2 shrink-0">
        <div className="flex items-center gap-1 mb-1.5">
          <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] text-[#9B6DFF] uppercase tracking-wider">⚡ AI Situation Summary</span>
        </div>
        <p className="text-[12px] text-[#C8D0E0] leading-relaxed">
          {data.ai_summary ?? 'Generating summary...'}
        </p>
        {data.ai_summary_generated_at && (
          <div className="text-[9px] text-[#4B5A7A] mt-1.5 flex items-center gap-1">
            Generated {formatDistanceToNow(new Date(data.ai_summary_generated_at), { addSuffix: true })}
            <span className="text-[#F2784B] cursor-pointer hover:underline" onClick={handleRefresh}>
              {refreshing ? <RotateCw size={9} className="inline animate-spin" /> : 'Refresh'}
            </span>
          </div>
        )}
      </div>

      {/* Top Blockers */}
      <div className="flex-1 overflow-hidden">
        <div className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A] uppercase tracking-wider px-1 mb-1">Top Blockers</div>
        <div className="px-1">
          {(data.top_blockers ?? []).length === 0 ? (
            <p className="text-[11px] text-[#2A3550] py-4 text-center">No open blockers</p>
          ) : (
            (data.top_blockers ?? []).map((b, i) => (
              <BlockerRow key={b.id} blocker={b} isLast={i === (data.top_blockers ?? []).length - 1} />
            ))
          )}
        </div>
      </div>

      {/* Category counts row */}
      <div className="flex items-center gap-3 pt-2 border-t border-[#1A2035] px-1 shrink-0 flex-wrap">
        <CountPill icon="🔧" count={data.maintenance_total} overdue={data.maintenance_overdue} />
        <CountPill icon="🧹" count={data.cleaning_total} overdue={data.cleaning_overdue} />
        <CountPill icon="→" count={data.move_in_pending} overdue={data.move_in_overdue} />
        <CountPill icon="↺" count={data.turnaround_total} overdue={data.turnaround_breach} />
        <button className="text-[11px] text-[#F2784B] hover:underline ml-auto" onClick={() => onMoreClick(data.cluster, 'all')}>
          View all →
        </button>
      </div>
    </div>
  )
}
