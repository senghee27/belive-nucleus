'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Play, Pause, Clock, Zap, Plus } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'

type Schedule = {
  id: string; name: string; description: string | null; agent: string
  group_ids: string[]; enabled: boolean; frequency: string
  days_of_week: number[] | null; time_myt: string | null; skill: string
  custom_prompt: string | null; output_actions: string[]
  last_run_at: string | null; last_run_status: string | null
  last_run_summary: string | null; total_runs: number; next_run_at: string | null
}

const AGENT_COLORS: Record<string, string> = {
  ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2',
}
const SKILL_LABELS: Record<string, string> = {
  morning_briefing: 'Morning Briefing', issue_detection: 'Issue Detection',
  occ_nightly: 'OCC Nightly', general_scan: 'General Scan',
  maintenance_review: 'Maintenance Review', custom: 'Custom',
}
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function SchedulesManager({ initialSchedules }: { initialSchedules: Schedule[] }) {
  const [schedules, setSchedules] = useState<Schedule[]>(initialSchedules)
  const [running, setRunning] = useState<string | null>(null)
  const [, setTick] = useState(0)

  // Countdown timer
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 60000)
    return () => clearInterval(timer)
  }, [])

  const active = schedules.filter(s => s.enabled).length

  async function toggleEnabled(schedule: Schedule) {
    const newState = !schedule.enabled
    try {
      await fetch(`/api/schedules/${schedule.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: newState }),
      })
      setSchedules(prev => prev.map(s => s.id === schedule.id ? { ...s, enabled: newState } : s))
      toast.success(`${schedule.name} ${newState ? 'enabled' : 'paused'}`)
    } catch { toast.error('Failed') }
  }

  async function handleRunNow(schedule: Schedule) {
    setRunning(schedule.id)
    try {
      const res = await fetch(`/api/schedules/${schedule.id}/run`, {
        method: 'POST',
        headers: { 'x-nucleus-secret': 'belive_nucleus_2026' },
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`${schedule.name}: ${data.summary}`)
        // Refresh
        const refreshRes = await fetch('/api/schedules')
        const refreshData = await refreshRes.json()
        if (refreshData.ok) setSchedules(refreshData.schedules)
      } else {
        toast.error(data.error ?? 'Run failed')
      }
    } catch { toast.error('Run failed') }
    finally { setRunning(null) }
  }

  function getCountdown(nextRun: string | null): string {
    if (!nextRun) return 'Not scheduled'
    const diff = new Date(nextRun).getTime() - Date.now()
    if (diff <= 0) return 'Due now'
    const hours = Math.floor(diff / 3600000)
    const mins = Math.floor((diff % 3600000) / 60000)
    if (hours > 0) return `in ${hours}h ${mins}m`
    return `in ${mins}m`
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#E8EEF8]">Scan Schedules</h2>
        <button
          onClick={() => toast.info('Add Schedule coming soon')}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2784B] text-white text-xs font-medium hover:bg-[#E0673D] transition-colors"
        >
          <Plus size={14} /> New Schedule
        </button>
      </div>

      <div className="flex gap-4 text-xs text-[#4B5A7A]">
        <span>{active} active</span>
        {schedules.length > active && <span className="text-[#E8A838]">{schedules.length - active} paused</span>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {schedules.map(schedule => {
          const agentColor = AGENT_COLORS[schedule.agent] ?? '#F2784B'
          const isRunning = running === schedule.id

          return (
            <div
              key={schedule.id}
              className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4 relative overflow-hidden"
            >
              <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: agentColor }} />

              {/* Header */}
              <div className="flex items-center justify-between mb-2 pl-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-[#E8EEF8]">{schedule.name}</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${schedule.enabled ? 'bg-[#4BF2A2]/10 text-[#4BF2A2]' : 'bg-[#E8A838]/10 text-[#E8A838]'}`}>
                    {schedule.enabled ? 'active' : 'paused'}
                  </span>
                </div>
              </div>

              {/* Description */}
              {schedule.description && (
                <p className="pl-2 text-[10px] text-[#4B5A7A] mb-2">{schedule.description}</p>
              )}

              {/* Badges */}
              <div className="pl-2 flex flex-wrap items-center gap-2 mb-3">
                <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ color: agentColor, backgroundColor: agentColor + '15' }}>
                  {schedule.agent.toUpperCase()}
                </span>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#111D30] text-[#8A9BB8]">
                  {SKILL_LABELS[schedule.skill] ?? schedule.skill}
                </span>
                {schedule.time_myt && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#111D30] text-[#8A9BB8] flex items-center gap-1">
                    <Clock size={9} /> {schedule.time_myt} MYT
                  </span>
                )}
              </div>

              {/* Days */}
              {schedule.days_of_week && (
                <div className="pl-2 flex gap-1 mb-3">
                  {DAYS.map((d, i) => (
                    <span key={d} className={`text-[8px] w-5 h-5 flex items-center justify-center rounded ${schedule.days_of_week?.includes(i) ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#2A3550]'}`}>
                      {d[0]}
                    </span>
                  ))}
                </div>
              )}

              {/* Groups */}
              <div className="pl-2 text-[10px] text-[#4B5A7A] mb-3">
                {schedule.group_ids.length === 0
                  ? 'All enabled groups'
                  : `${schedule.group_ids.length} group${schedule.group_ids.length !== 1 ? 's' : ''}`}
              </div>

              {/* Stats */}
              <div className="pl-2 flex items-center gap-3 text-[10px] mb-3">
                {schedule.last_run_at && (
                  <span className="text-[#4B5A7A]">
                    {schedule.last_run_status === 'success' ? '✅' : schedule.last_run_status === 'failed' ? '❌' : '⚠️'}{' '}
                    {formatDistanceToNow(new Date(schedule.last_run_at), { addSuffix: true })}
                  </span>
                )}
                <span className="font-[family-name:var(--font-jetbrains-mono)] text-[#8A9BB8]">
                  {getCountdown(schedule.next_run_at)}
                </span>
                <span className="text-[#2A3550]">{schedule.total_runs} runs</span>
              </div>

              {/* Last run summary */}
              {schedule.last_run_summary && (
                <p className="pl-2 text-[9px] text-[#2A3550] mb-3 line-clamp-1">{schedule.last_run_summary}</p>
              )}

              {/* Actions */}
              <div className="pl-2 flex items-center gap-2">
                <button
                  onClick={() => handleRunNow(schedule)}
                  disabled={isRunning}
                  className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#F2784B]/10 text-[#F2784B] text-[10px] font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50"
                >
                  <Zap size={10} /> {isRunning ? 'Running...' : 'Run Now'}
                </button>
                <button
                  onClick={() => toggleEnabled(schedule)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#8A9BB8] hover:bg-[#111D30] transition-colors"
                >
                  {schedule.enabled ? <Pause size={10} /> : <Play size={10} />}
                  {schedule.enabled ? 'Pause' : 'Resume'}
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
