'use client'

import { useState, useEffect } from 'react'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import type { ClusterHealth } from '@/lib/types'

const DOT_COLORS: Record<string, string> = { red: '#E05252', amber: '#E8A838', green: '#4BF2A2' }
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

export default function ClustersPage() {
  const [clusters, setClusters] = useState<ClusterHealth[]>([])
  const [selected, setSelected] = useState<ClusterHealth | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/clusters').then(r => r.json()).then(d => { if (d.ok) setClusters(d.clusters) }).finally(() => setLoading(false))
  }, [])

  const redCount = clusters.filter(c => c.health_status === 'red').length
  const greenCount = clusters.filter(c => c.health_status === 'green').length

  if (loading) return <div className="flex items-center justify-center py-20 text-[13px] text-[#4B5A7A]">Loading...</div>

  return (
    <div className="px-4 py-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[17px] font-semibold text-[#E8EEF8]">Cluster Health</span>
      </div>

      {/* Dot row */}
      <div className="flex items-center gap-2 mb-2 overflow-x-auto pb-1">
        {clusters.map(c => (
          <button key={c.cluster} onClick={() => setSelected(c)} className="flex flex-col items-center gap-1 shrink-0">
            <span className={`w-7 h-7 rounded-full border-2 ${selected?.cluster === c.cluster ? 'border-white' : 'border-transparent'}`}
              style={{ backgroundColor: DOT_COLORS[c.health_status] }} />
            <span className="text-[10px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{c.cluster.replace('C', '')}</span>
          </button>
        ))}
      </div>

      <p className="text-[11px] text-[#4B5A7A] mb-4">
        {redCount > 0 && <span className="text-[#E05252]">{redCount} critical</span>}
        {redCount > 0 && greenCount > 0 && ' · '}
        {greenCount > 0 && <span className="text-[#4BF2A2]">{greenCount} green</span>}
      </p>

      {/* Cluster cards */}
      <div className="space-y-2.5">
        {clusters.map(c => {
          const borderColor = DOT_COLORS[c.health_status]
          return (
            <button key={c.cluster} onClick={() => setSelected(c)}
              className="w-full text-left bg-[#0D1525] border rounded-[14px] p-3.5"
              style={{ borderColor, borderLeftWidth: 4 }}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold font-[family-name:var(--font-jetbrains-mono)]"
                    style={{ color: CLUSTER_COLORS[c.cluster] }}>{c.cluster}</span>
                  <span className="text-[13px] font-medium text-[#E8EEF8]">{c.cluster_name}</span>
                </div>
                <span className="text-[15px] font-bold font-[family-name:var(--font-jetbrains-mono)]"
                  style={{ color: DOT_COLORS[c.health_status] }}>{c.health_score}</span>
              </div>
              <div className="grid grid-cols-4 gap-1">
                <Metric icon="🔧" label="Maint" value={c.maintenance_total} overdue={c.maintenance_overdue} />
                <Metric icon="🧹" label="Clean" value={c.cleaning_total} overdue={c.cleaning_overdue} />
                <Metric icon="→" label="In" value={c.move_in_pending} overdue={c.move_in_overdue} />
                <Metric icon="↺" label="Turn" value={c.turnaround_total} overdue={c.turnaround_breach} />
              </div>
            </button>
          )
        })}
      </div>

      {/* Detail sheet */}
      <BottomSheet isOpen={!!selected} onClose={() => setSelected(null)} height="70vh">
        {selected && (
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-[13px] font-bold font-[family-name:var(--font-jetbrains-mono)]"
                  style={{ color: CLUSTER_COLORS[selected.cluster] }}>{selected.cluster}</span>
                <span className="text-[17px] font-semibold text-[#E8EEF8] ml-2">{selected.cluster_name}</span>
              </div>
              <span className="text-[13px] font-bold px-2 py-0.5 rounded-full"
                style={{ color: DOT_COLORS[selected.health_status], backgroundColor: DOT_COLORS[selected.health_status] + '20' }}>
                {selected.health_status.toUpperCase()}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-2 mb-4">
              {[
                { icon: '🔧', label: 'Maint', value: selected.maintenance_total },
                { icon: '🧹', label: 'Clean', value: selected.cleaning_total },
                { icon: '→', label: 'In', value: selected.move_in_pending },
                { icon: '↺', label: 'Turn', value: selected.turnaround_total },
              ].map(m => (
                <div key={m.label} className="bg-[#080E1C] rounded-[10px] p-2.5 text-center">
                  <span className="text-sm">{m.icon}</span>
                  <p className="text-[17px] font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#E8EEF8]">{m.value}</p>
                  <p className="text-[10px] text-[#4B5A7A]">{m.label}</p>
                </div>
              ))}
            </div>

            <div className="h-px bg-[#1A2035] mb-3" />

            <div className="space-y-2 text-[13px]">
              <div className="flex justify-between"><span className="text-[#4B5A7A]">Health Score</span><span className="text-[#E8EEF8] font-bold">{selected.health_score}</span></div>
              <div className="flex justify-between"><span className="text-[#4B5A7A]">Silent Hours</span><span className={`${selected.cluster_silent_hours > 24 ? 'text-[#E05252]' : 'text-[#E8EEF8]'}`}>{Math.round(selected.cluster_silent_hours)}h</span></div>
              <div className="flex justify-between"><span className="text-[#4B5A7A]">Brief Sent Today</span><span className="text-[#E8EEF8]">{selected.brief_sent_today ? '✅' : '❌'}</span></div>
              <div className="flex justify-between"><span className="text-[#4B5A7A]">Compliance</span><span className="text-[#E8EEF8]">{selected.today_compliance ?? '—'}</span></div>
            </div>
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function Metric({ icon, label, value, overdue }: { icon: string; label: string; value: number; overdue?: number }) {
  const color = (overdue ?? 0) > 0 ? '#E05252' : value === 0 ? '#4B5A7A' : '#4BF2A2'
  return (
    <div className="text-center">
      <span className="text-[10px]">{icon}</span>
      <p className="text-[13px] font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{value}</p>
      <p className="text-[9px] text-[#4B5A7A]">{label}</p>
    </div>
  )
}
