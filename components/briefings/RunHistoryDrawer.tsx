'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { X, RotateCw, ChevronDown, ChevronUp, Check, AlertCircle, SkipForward, Loader2 } from 'lucide-react'
import type { BriefingCronRun } from '@/lib/types'

export function RunHistoryDrawer({ reportType, reportName, onClose, onRetry }: {
  reportType: string
  reportName: string
  onClose: () => void
  onRetry: (type: string, cluster?: string) => void
}) {
  const router = useRouter()
  const [runs, setRuns] = useState<BriefingCronRun[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    fetch(`/api/briefings/cron-runs?report_type=${reportType}&limit=30`)
      .then(r => r.json())
      .then(d => { if (d.ok) setRuns(d.runs) })
      .finally(() => setLoading(false))
  }, [reportType])

  // Auto-expand failed runs
  useEffect(() => {
    const failedIds = runs.filter(r => r.status === 'failed').map(r => r.id)
    setExpanded(new Set(failedIds))
  }, [runs])

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-[520px] max-w-full h-full bg-[#0D1525] border-l border-[#1A2035] overflow-y-auto"
        onClick={e => e.stopPropagation()}>

        <div className="flex items-center justify-between p-4 border-b border-[#1A2035] sticky top-0 bg-[#0D1525] z-10">
          <div>
            <h3 className="text-sm font-semibold text-[#E8EEF8]">Run History — {reportName}</h3>
            <p className="text-[10px] text-[#4B5A7A]">Last {runs.length} runs</p>
          </div>
          <button onClick={onClose} className="text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors"><X size={16} /></button>
        </div>

        <div className="p-4 space-y-2">
          {loading ? (
            <div className="text-center py-8 text-[#4B5A7A] text-xs">Loading...</div>
          ) : runs.length === 0 ? (
            <div className="text-center py-8 text-[#4B5A7A] text-xs">No runs yet</div>
          ) : (
            runs.map(run => {
              const isExpanded = expanded.has(run.id)
              const date = new Date(run.started_at)
              const dateStr = date.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })
              const timeStr = date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

              const statusColor = run.status === 'success' ? '#4BF2A2' : run.status === 'failed' ? '#E05252' : run.status === 'skipped' ? '#4B5A7A' : '#4BB8F2'
              const StatusIcon = run.status === 'success' ? Check : run.status === 'failed' ? AlertCircle : run.status === 'skipped' ? SkipForward : Loader2

              // Skipped runs — single line
              if (run.status === 'skipped') {
                return (
                  <div key={run.id} className="flex items-center gap-2 text-[11px] text-[#4B5A7A] py-1.5 border-b border-[#1A2035]/50">
                    <SkipForward size={12} />
                    <span>{dateStr} {timeStr}</span>
                    <span className="flex-1">— {run.skip_reason ?? 'Skipped'}</span>
                    <span className="text-[9px] uppercase">SKIPPED</span>
                  </div>
                )
              }

              return (
                <div key={run.id} className={`rounded-lg border ${run.status === 'failed' ? 'border-l-2 border-l-[#E05252] border-[#1A2035]' : 'border-[#1A2035]'}`}>
                  {/* Header — always visible */}
                  <button onClick={() => toggleExpand(run.id)} className="flex items-center justify-between w-full p-3 text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{dateStr} {timeStr}</span>
                      {run.cluster && <span className="text-[9px] px-1 py-0.5 rounded bg-[#1A2035] text-[#8A9BB8]">{run.cluster}</span>}
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold uppercase" style={{ color: statusColor }}>{run.status}</span>
                      <StatusIcon size={12} style={{ color: statusColor }} className={run.status === 'running' ? 'animate-spin' : ''} />
                      {isExpanded ? <ChevronUp size={12} className="text-[#4B5A7A]" /> : <ChevronDown size={12} className="text-[#4B5A7A]" />}
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {isExpanded && (
                    <div className="px-3 pb-3 space-y-2 border-t border-[#1A2035] pt-2">
                      <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[11px]">
                        <span className="text-[#4B5A7A]">Triggered by</span>
                        <span className="text-[#8A9BB8]">{run.triggered_by === 'cron' ? 'Vercel cron (scheduled)' : run.triggered_by === 'manual' ? `Manual — ${run.triggered_by_user ?? 'Unknown'}` : 'Retry'}</span>
                        <span className="text-[#4B5A7A]">Duration</span>
                        <span className="text-[#8A9BB8]">{run.duration_seconds !== null ? `${run.duration_seconds} seconds` : 'In progress...'}</span>
                        {run.report_id && (
                          <>
                            <span className="text-[#4B5A7A]">Report</span>
                            <button onClick={() => router.push(`/briefings/${run.report_id}`)} className="text-[#4BB8F2] hover:underline text-left">View report →</button>
                          </>
                        )}
                      </div>

                      {/* Error */}
                      {run.error_message && (
                        <div className="bg-[#E05252]/5 border border-[#E05252]/20 rounded p-2">
                          <p className="text-[10px] text-[#E05252] uppercase tracking-wider font-bold mb-0.5">Error</p>
                          <p className="text-[11px] text-[#E05252]">{run.error_message}</p>
                          {run.retry_count > 0 && <p className="text-[10px] text-[#4B5A7A] mt-0.5">Retried {run.retry_count} time{run.retry_count !== 1 ? 's' : ''}</p>}
                        </div>
                      )}

                      {/* Sources */}
                      {(run.sources_succeeded.length > 0 || run.sources_failed.length > 0) && (
                        <div>
                          <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider mb-1">Data Sources</p>
                          {run.sources_succeeded.map((s, i) => (
                            <p key={i} className="text-[11px] flex items-center gap-1">
                              <span className="text-[#4BF2A2]">✅</span>
                              <span className="text-[#E8EEF8]">{s.name}</span>
                              {s.record_count !== undefined && <span className="text-[#4B5A7A]">{s.record_count} records</span>}
                            </p>
                          ))}
                          {run.sources_failed.map((s, i) => (
                            <p key={i} className="text-[11px] flex items-center gap-1">
                              <span className="text-[#E05252]">❌</span>
                              <span className="text-[#E8EEF8]">{s.name}</span>
                              {s.error && <span className="text-[#E05252]">— {s.error}</span>}
                            </p>
                          ))}
                        </div>
                      )}

                      {/* AI Usage */}
                      {run.tokens_used && (
                        <p className="text-[11px] text-[#4B5A7A]">AI: {run.tokens_used.toLocaleString()} tokens · {run.model}</p>
                      )}

                      {/* Retry button for failed */}
                      {run.status === 'failed' && (
                        <button onClick={() => onRetry(run.report_type, run.cluster ?? undefined)}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#E05252]/10 text-[#E05252] hover:bg-[#E05252]/20 transition-colors">
                          <RotateCw size={10} /> Retry this run
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
