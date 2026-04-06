'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Play, RotateCw, History, Eye, Check, X, AlertCircle, SkipForward, Loader2 } from 'lucide-react'
import type { BriefingScheduleConfig, BriefingCronRun } from '@/lib/types'

const CLUSTER_NAMES: Record<string, string> = {
  C1: 'JB', C2: 'Penang', C3: 'Nilai', C4: 'Ampang', C5: 'Ara Damansara',
  C6: 'PJ Subang', C7: 'Seri Kembangan', C8: 'Sentul', C9: 'Cheras',
  C10: 'Mont Kiara', C11: 'M Vertica',
}
const ALL_CLUSTERS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']

const STATUS_ICON: Record<string, { icon: typeof Check; color: string; label: string }> = {
  success: { icon: Check, color: '#4BF2A2', label: 'Last run OK' },
  failed: { icon: X, color: '#E05252', label: 'Last run failed' },
  running: { icon: Loader2, color: '#4BB8F2', label: 'Running...' },
  skipped: { icon: SkipForward, color: '#4B5A7A', label: 'Skipped' },
}

function RunDot({ run }: { run: BriefingCronRun }) {
  const color = run.status === 'success' ? '#4BF2A2' : run.status === 'failed' ? '#E05252' : run.status === 'skipped' ? '#2A3550' : '#4BB8F2'
  const date = new Date(run.started_at)
  const tooltip = `${date.toLocaleDateString('en-MY', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })} · ${run.duration_seconds ?? 0}s · ${run.status}`

  return (
    <span className={`w-2.5 h-2.5 rounded-full inline-block ${run.status === 'running' ? 'animate-pulse' : ''}`}
      style={{ backgroundColor: color }}
      title={tooltip} />
  )
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'Just now'
  if (diff < 3600000) return `${Math.round(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}h ago`
  return `${Math.round(diff / 86400000)}d ago`
}

export function ScheduleCard({ config, onRunNow, onRetry, onToggle, onViewHistory }: {
  config: BriefingScheduleConfig
  onRunNow: (type: string, cluster?: string) => void
  onRetry: (type: string, cluster?: string) => void
  onToggle: (type: string, enabled: boolean) => void
  onViewHistory: () => void
}) {
  const router = useRouter()
  const [showConfirm, setShowConfirm] = useState(false)
  const [expanded, setExpanded] = useState(false)

  const status = config.last_run_status as string | null
  const statusInfo = STATUS_ICON[status ?? ''] ?? { icon: AlertCircle, color: '#E8A838', label: 'No runs yet' }
  const StatusIcon = statusInfo.icon
  const recentRuns = config.recent_runs ?? []

  const isRunning = recentRuns.some(r => r.status === 'running')
  const hasFailed = status === 'failed'

  // Success rate bar
  const rateColor = config.success_rate >= 81 ? '#4BF2A2' : config.success_rate >= 61 ? '#E8A838' : config.success_rate > 0 ? '#E05252' : '#2A3550'

  const handleRunClick = () => {
    if (config.cron_expression) {
      setShowConfirm(true)
    } else {
      onRunNow(config.report_type)
    }
  }

  // Per-cluster expanded view
  if (config.is_per_cluster && expanded) {
    const clusterRuns = new Map<string, BriefingCronRun>()
    for (const run of recentRuns) {
      if (run.cluster && !clusterRuns.has(run.cluster)) clusterRuns.set(run.cluster, run)
    }
    const failedClusters = ALL_CLUSTERS.filter(c => clusterRuns.get(c)?.status === 'failed')

    return (
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.report_icon}</span>
            <span className="text-sm font-semibold text-[#E8EEF8]">{config.report_name} ({ALL_CLUSTERS.length} clusters)</span>
          </div>
          <div className="flex items-center gap-1.5">
            {failedClusters.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[#E05252]/15 text-[#E05252]">{failedClusters.length} failed</span>
            )}
            <StatusIcon size={14} style={{ color: statusInfo.color }} className={isRunning ? 'animate-spin' : ''} />
          </div>
        </div>

        <p className="text-[10px] text-[#4B5A7A] mb-3">{config.schedule_description}</p>

        {/* Cluster grid */}
        <div className="space-y-1 mb-3">
          {ALL_CLUSTERS.map(c => {
            const run = clusterRuns.get(c)
            const clusterStatus = run?.status ?? 'pending'
            const clusterColor = clusterStatus === 'success' ? '#4BF2A2' : clusterStatus === 'failed' ? '#E05252' : clusterStatus === 'running' ? '#4BB8F2' : '#4B5A7A'
            const time = run?.started_at ? new Date(run.started_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }) : '--'
            const dur = run?.duration_seconds ? `${run.duration_seconds}s` : '--'

            return (
              <div key={c} className="flex items-center gap-2 text-[11px]">
                <span className="w-7 font-bold text-[#8A9BB8]">{c}</span>
                <span className="w-28 text-[#4B5A7A] truncate">{CLUSTER_NAMES[c]}</span>
                <span style={{ color: clusterColor }}>{clusterStatus === 'success' ? '✅' : clusterStatus === 'failed' ? '❌' : clusterStatus === 'running' ? '🔄' : '⏳'}</span>
                <span className="text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{time}</span>
                <span className="text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{dur}</span>
                {run?.report_id && (
                  <button onClick={() => router.push(`/briefings/${run.report_id}`)} className="text-[9px] text-[#4BB8F2] hover:underline">View</button>
                )}
                {clusterStatus === 'failed' && (
                  <button onClick={() => onRetry(config.report_type, c)} className="text-[9px] text-[#E05252] hover:underline">Retry</button>
                )}
              </div>
            )
          })}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#1A2035]">
          <button onClick={() => onRunNow(config.report_type)} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#F2784B]/10 text-[#F2784B] hover:bg-[#F2784B]/20 transition-colors">
            <Play size={10} /> Run All Now
          </button>
          {failedClusters.length > 0 && (
            <button onClick={() => failedClusters.forEach(c => onRetry(config.report_type, c))}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#E05252]/10 text-[#E05252] hover:bg-[#E05252]/20 transition-colors">
              <RotateCw size={10} /> Retry Failed ({failedClusters.length})
            </button>
          )}
          <button onClick={onViewHistory} className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors">
            <History size={10} /> History
          </button>
          <div className="flex-1" />
          <button onClick={() => setExpanded(false)} className="text-[9px] text-[#4B5A7A] hover:text-[#8A9BB8]">Collapse</button>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">{config.report_icon}</span>
            <span className="text-sm font-semibold text-[#E8EEF8]">{config.report_name}</span>
            {config.is_per_cluster && (
              <button onClick={() => setExpanded(true)} className="text-[9px] text-[#4B5A7A] hover:text-[#8A9BB8]">({ALL_CLUSTERS.length} clusters)</button>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px]" style={{ color: statusInfo.color }}>{statusInfo.label}</span>
            <StatusIcon size={14} style={{ color: statusInfo.color }} className={isRunning ? 'animate-spin' : ''} />
          </div>
        </div>

        {/* Info rows */}
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-[11px] mb-3">
          <span className="text-[#4B5A7A]">Schedule</span>
          <span className="text-[#8A9BB8]">{config.schedule_description ?? 'Not scheduled'}</span>
          <span className="text-[#4B5A7A]">Last run</span>
          <span className="text-[#8A9BB8]">
            {config.last_run_at ? `${timeAgo(config.last_run_at)} · ${recentRuns[0]?.duration_seconds ?? 0}s · ${status === 'success' ? '✅' : status === 'failed' ? '❌' : '⏳'}` : 'Never'}
          </span>
          {config.total_runs > 0 && (
            <>
              <span className="text-[#4B5A7A]">Success rate</span>
              <span className="flex items-center gap-2">
                <span className="flex-1 max-w-[120px] h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                  <span className="block h-full rounded-full" style={{ width: `${config.success_rate}%`, backgroundColor: rateColor }} />
                </span>
                <span className="text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{config.success_rate}%</span>
                <span className="text-[#4B5A7A]">({config.successful_runs}/{config.total_runs})</span>
              </span>
            </>
          )}
        </div>

        {/* Last 7 runs dots */}
        {recentRuns.length > 0 && (
          <div className="flex items-center gap-1.5 mb-3">
            <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider mr-1">Last {recentRuns.length}</span>
            {recentRuns.map(r => <RunDot key={r.id} run={r} />)}
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-[#1A2035]">
          <button onClick={handleRunClick} disabled={isRunning}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#F2784B]/10 text-[#F2784B] hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50">
            {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            {isRunning ? 'Running...' : 'Run Now'}
          </button>
          {hasFailed && (
            <button onClick={() => onRetry(config.report_type)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-[#E05252]/10 text-[#E05252] hover:bg-[#E05252]/20 transition-colors">
              <RotateCw size={10} /> Retry
            </button>
          )}
          {config.last_report_id && (
            <button onClick={() => router.push(`/briefings/${config.last_report_id}`)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors">
              <Eye size={10} /> Last Report
            </button>
          )}
          <button onClick={onViewHistory}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors">
            <History size={10} /> History
          </button>
        </div>
      </div>

      {/* Confirm Dialog */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirm(false)}>
          <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-5 w-[360px] shadow-xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-[#E8EEF8] mb-2">Run {config.report_name} now?</h3>
            <p className="text-[11px] text-[#4B5A7A] mb-1">This will generate a new report immediately.</p>
            {config.last_run_at && <p className="text-[11px] text-[#4B5A7A] mb-3">Last generated: {timeAgo(config.last_run_at)}</p>}
            <p className="text-[10px] text-[#2A3550] mb-4">A new draft will be created in Reports.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowConfirm(false)} className="px-3 py-1.5 rounded text-xs text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors">Cancel</button>
              <button onClick={() => { setShowConfirm(false); onRunNow(config.report_type) }}
                className="flex items-center gap-1 px-3 py-1.5 rounded bg-[#F2784B] text-white text-xs font-medium hover:bg-[#F2784B]/90 transition-colors">
                <Play size={11} /> Run Now
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
