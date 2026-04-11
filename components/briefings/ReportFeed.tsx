'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { Send, Settings, Check, RotateCw, FileText, X } from 'lucide-react'
import type { BriefingReport, BriefingReportStatus } from '@/lib/types'
import { REPORT_TYPE_META } from '@/lib/types'
import { AutoSendDrawer } from './AutoSendDrawer'
import { sortClusterCodesNatural } from '@/lib/clusters/sort'

const STATUS_PILLS: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-[#E8A838]/15', text: 'text-[#E8A838]', label: 'Draft' },
  pending_review: { bg: 'bg-[#4BB8F2]/15', text: 'text-[#4BB8F2]', label: 'Pending' },
  approved: { bg: 'bg-[#4BF2A2]/15', text: 'text-[#4BF2A2]', label: 'Approved' },
  sent: { bg: 'bg-[#4BF2A2]/15', text: 'text-[#4BF2A2]', label: 'Sent' },
  failed: { bg: 'bg-[#E05252]/15', text: 'text-[#E05252]', label: 'Failed' },
  discarded: { bg: 'bg-[#2A3550]/30', text: 'text-[#4B5A7A]', label: 'Discarded' },
}

const TYPE_GROUPS = [
  { key: 'all', label: 'All' },
  { key: 'daily', label: 'Daily', types: ['MORNING_BRIEF', 'MIDDAY_PULSE', 'EOD_SUMMARY'] },
  { key: 'cluster', label: 'Cluster', types: ['STANDUP_BRIEF', 'COMPLIANCE_ALERT'] },
  { key: 'management', label: 'Management', types: ['WEEKLY_OPS', 'MONTHLY_REPORT', 'OWNER_SATISFACTION'] },
  { key: 'on_demand', label: 'On-Demand', types: ['CLUSTER_SNAPSHOT', 'INCIDENT_SUMMARY', 'SALES_SNAPSHOT'] },
]

const STATUS_FILTERS: BriefingReportStatus[] = ['draft', 'sent', 'failed', 'discarded']
const CLUSTERS = sortClusterCodesNatural(['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11'])

export function ReportFeed() {
  const router = useRouter()
  const [reports, setReports] = useState<BriefingReport[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [typeGroup, setTypeGroup] = useState('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clusterFilter, setClusterFilter] = useState<string>('all')

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [sending, setSending] = useState(false)

  // Auto-send drawer
  const [showAutoSend, setShowAutoSend] = useState(false)

  const fetchReports = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (clusterFilter !== 'all') params.set('cluster', clusterFilter)

      const res = await fetch(`/api/briefings?${params}`)
      const data = await res.json()
      if (data.ok) {
        let filtered = data.reports as BriefingReport[]
        if (typeGroup !== 'all') {
          const group = TYPE_GROUPS.find(g => g.key === typeGroup)
          if (group?.types) filtered = filtered.filter(r => group.types!.includes(r.report_type))
        }
        setReports(filtered)
      }
    } catch { toast.error('Failed to load reports') }
    finally { setLoading(false) }
  }, [typeGroup, statusFilter, clusterFilter])

  useEffect(() => { fetchReports() }, [fetchReports])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('briefing-reports')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefing_reports' }, () => {
        fetchReports()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchReports])

  // Stats
  const draftCount = reports.filter(r => r.status === 'draft').length
  const sentCount = reports.filter(r => r.status === 'sent').length
  const failedCount = reports.filter(r => r.status === 'failed').length

  // Group by date
  const grouped = new Map<string, BriefingReport[]>()
  for (const r of reports) {
    const day = new Date(r.created_at).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })
    const list = grouped.get(day) ?? []
    list.push(r)
    grouped.set(day, list)
  }

  // Selection
  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const selectAll = () => {
    const drafts = reports.filter(r => r.status === 'draft').map(r => r.id)
    setSelected(prev => prev.size === drafts.length ? new Set() : new Set(drafts))
  }

  const handleSendSelected = async () => {
    if (selected.size === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/briefings/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_ids: [...selected] }),
      })
      const data = await res.json()
      const successes = data.results?.filter((r: { success: boolean }) => r.success).length ?? 0
      toast.success(`Sent ${successes}/${selected.size} reports`)
      setSelected(new Set())
      fetchReports()
    } catch { toast.error('Batch send failed') }
    finally { setSending(false) }
  }

  const handleSendAll = async () => {
    const drafts = reports.filter(r => r.status === 'draft').map(r => r.id)
    if (drafts.length === 0) return
    setSelected(new Set(drafts))
    setSending(true)
    try {
      const res = await fetch('/api/briefings/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_ids: drafts }),
      })
      const data = await res.json()
      const successes = data.results?.filter((r: { success: boolean }) => r.success).length ?? 0
      toast.success(`Sent ${successes}/${drafts.length} reports`)
      setSelected(new Set())
      fetchReports()
    } catch { toast.error('Batch send failed') }
    finally { setSending(false) }
  }

  const handleSendSingle = async (id: string) => {
    try {
      const res = await fetch(`/api/briefings/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const data = await res.json()
      toast[data.success ? 'success' : 'error'](data.success ? 'Report sent' : `Send failed: ${data.error ?? 'Unknown'}`)
      fetchReports()
    } catch { toast.error('Send failed') }
  }

  const handleRetrySingle = async (id: string) => {
    await handleSendSingle(id)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Stats Row */}
      <div className="flex items-center gap-3 mb-4">
        <StatPill label="Draft" count={draftCount} color="#E8A838" active={statusFilter === 'draft'} onClick={() => setStatusFilter(statusFilter === 'draft' ? 'all' : 'draft')} />
        <StatPill label="Sent Today" count={sentCount} color="#4BF2A2" active={statusFilter === 'sent'} onClick={() => setStatusFilter(statusFilter === 'sent' ? 'all' : 'sent')} />
        <StatPill label="Failed" count={failedCount} color="#E05252" active={statusFilter === 'failed'} onClick={() => setStatusFilter(statusFilter === 'failed' ? 'all' : 'failed')} />
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 mb-3">
        <button onClick={selectAll}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#111D30] text-[#8A9BB8] text-xs hover:bg-[#1A2035] transition-colors">
          <Check size={12} />
          {selected.size > 0 ? `${selected.size} selected` : 'Select All'}
        </button>
        <button onClick={handleSendSelected} disabled={selected.size === 0 || sending}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-xs font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-30">
          <Send size={11} />
          Send Selected ({selected.size})
        </button>
        <button onClick={handleSendAll} disabled={draftCount === 0 || sending}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-xs font-medium hover:bg-[#4BF2A2]/20 transition-colors disabled:opacity-30">
          <Send size={11} />
          Send All Drafts
        </button>
        <div className="flex-1" />
        <button onClick={() => setShowAutoSend(true)}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#111D30] text-[#8A9BB8] text-xs hover:bg-[#1A2035] transition-colors">
          <Settings size={12} />
          Auto-Send
        </button>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="text-[10px] text-[#4B5A7A] uppercase tracking-wider">Type</span>
        {TYPE_GROUPS.map(g => (
          <button key={g.key} onClick={() => setTypeGroup(g.key)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${typeGroup === g.key ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {g.label}
          </button>
        ))}
        <span className="w-px h-4 bg-[#1A2035] mx-1" />
        <span className="text-[10px] text-[#4B5A7A] uppercase tracking-wider">Status</span>
        <button onClick={() => setStatusFilter('all')}
          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${statusFilter === 'all' ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
          All
        </button>
        {STATUS_FILTERS.map(s => (
          <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${statusFilter === s ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </button>
        ))}
        <span className="w-px h-4 bg-[#1A2035] mx-1" />
        <span className="text-[10px] text-[#4B5A7A] uppercase tracking-wider">Cluster</span>
        <button onClick={() => setClusterFilter('all')}
          className={`px-2 py-0.5 rounded text-[10px] transition-colors ${clusterFilter === 'all' ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
          All
        </button>
        {CLUSTERS.map(c => (
          <button key={c} onClick={() => setClusterFilter(clusterFilter === c ? 'all' : c)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${clusterFilter === c ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {c}
          </button>
        ))}
      </div>

      {/* Report Feed */}
      <div className="flex-1 overflow-y-auto space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <RotateCw size={16} className="animate-spin text-[#4B5A7A]" />
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#4B5A7A]">
            <FileText size={32} className="mb-2 opacity-50" />
            <p className="text-sm">No reports found</p>
          </div>
        ) : (
          [...grouped.entries()].map(([day, dayReports]) => (
            <div key={day}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-[#8A9BB8]">{day}</span>
                <span className="flex-1 h-px bg-[#1A2035]" />
              </div>
              <div className="space-y-1">
                {dayReports.map(r => {
                  const meta = REPORT_TYPE_META[r.report_type] ?? { icon: '📄', label: r.report_type }
                  const pill = STATUS_PILLS[r.status] ?? STATUS_PILLS.draft
                  const time = new Date(r.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })
                  const isSelected = selected.has(r.id)

                  return (
                    <div key={r.id}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors cursor-pointer hover:bg-[#111D30] ${isSelected ? 'bg-[#111D30] border border-[#F2784B]/30' : 'bg-[#0D1525]'}`}
                      onClick={() => router.push(`/briefings/${r.id}`)}>
                      {/* Checkbox */}
                      {r.status === 'draft' && (
                        <input type="checkbox" checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); toggleSelect(r.id) }}
                          onClick={(e) => e.stopPropagation()}
                          className="w-3.5 h-3.5 rounded border-[#2A3550] accent-[#F2784B]" />
                      )}
                      {r.status !== 'draft' && <span className="w-3.5" />}

                      {/* Time */}
                      <span className="text-[11px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)] w-12 shrink-0">{time}</span>

                      {/* Type icon */}
                      <span className="text-sm">{meta.icon}</span>

                      {/* Name + cluster */}
                      <span className="text-xs text-[#E8EEF8] truncate flex-1">{r.report_name}</span>
                      {r.cluster && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#1A2035] text-[#8A9BB8]">{r.cluster}</span>
                      )}

                      {/* Badges */}
                      {r.lee_edited && <span className="text-[9px]" title="Lee edited">✏️</span>}
                      {r.was_auto_sent && <span className="text-[9px]" title="Auto-sent">⚡</span>}

                      {/* Status pill */}
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${pill.bg} ${pill.text}`}>
                        {pill.label}{r.status === 'sent' ? ' ✓' : r.status === 'failed' ? ' ✗' : ''}
                      </span>

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        {r.status === 'draft' && (
                          <button onClick={() => handleSendSingle(r.id)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[#F2784B]/10 text-[#F2784B] hover:bg-[#F2784B]/20 transition-colors">
                            ▶ Send
                          </button>
                        )}
                        {r.status === 'failed' && (
                          <button onClick={() => handleRetrySingle(r.id)}
                            className="text-[9px] px-1.5 py-0.5 rounded bg-[#E05252]/10 text-[#E05252] hover:bg-[#E05252]/20 transition-colors">
                            ↺ Retry
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Auto-Send Drawer */}
      {showAutoSend && <AutoSendDrawer onClose={() => setShowAutoSend(false)} />}
    </div>
  )
}

function StatPill({ label, count, color, active, onClick }: {
  label: string; count: number; color: string; active: boolean; onClick: () => void
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
        active ? 'ring-1' : ''
      }`}
      style={{
        backgroundColor: `${color}15`,
        color,
        ...(active ? { ringColor: color } : {}),
      }}>
      <span className="text-base font-bold font-[family-name:var(--font-jetbrains-mono)]">{count}</span>
      {label}
    </button>
  )
}
