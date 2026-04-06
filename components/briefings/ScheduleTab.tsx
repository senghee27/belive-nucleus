'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { RotateCw } from 'lucide-react'
import { ScheduleCard } from './ScheduleCard'
import { RunHistoryDrawer } from './RunHistoryDrawer'
import type { BriefingScheduleConfig } from '@/lib/types'

const CATEGORY_LABELS: Record<string, string> = {
  daily: 'DAILY OPERATIONAL',
  cluster: 'CLUSTER BRIEFINGS',
  management: 'MANAGEMENT',
  on_demand: 'ON-DEMAND',
}
const CATEGORY_ORDER = ['daily', 'cluster', 'management', 'on_demand']

export function ScheduleTab() {
  const [configs, setConfigs] = useState<BriefingScheduleConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({ scheduled_types: 0, running: 0, failed_today: 0, success_rate_7d: 100 })
  const [historyType, setHistoryType] = useState<string | null>(null)

  const fetchSchedules = useCallback(async () => {
    try {
      const res = await fetch('/api/briefings/schedule')
      const data = await res.json()
      if (data.ok) {
        setConfigs(data.configs)
        setStats(data.stats)
      }
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchSchedules() }, [fetchSchedules])

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('briefing-cron-runs')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefing_cron_runs' }, () => {
        fetchSchedules()
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [fetchSchedules])

  const handleRunNow = async (reportType: string, cluster?: string) => {
    try {
      await fetch(`/api/briefings/schedule/${reportType}/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster, triggered_by_user: 'Lee Seng Hee' }),
      })
      toast.info(`${reportType} generation started...`)
      fetchSchedules()
    } catch { toast.error('Failed to start run') }
  }

  const handleRetry = async (reportType: string, cluster?: string) => {
    try {
      await fetch(`/api/briefings/schedule/${reportType}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cluster }),
      })
      toast.info(`Retrying ${reportType}...`)
      fetchSchedules()
    } catch { toast.error('Retry failed') }
  }

  const handleToggle = async (reportType: string, enabled: boolean) => {
    try {
      await fetch(`/api/briefings/schedule/${reportType}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      fetchSchedules()
    } catch { toast.error('Update failed') }
  }

  // Group by category
  const grouped = new Map<string, BriefingScheduleConfig[]>()
  for (const c of configs) {
    const list = grouped.get(c.category) ?? []
    list.push(c)
    grouped.set(c.category, list)
  }

  const rateColor = stats.success_rate_7d >= 90 ? '#4BF2A2' : stats.success_rate_7d >= 75 ? '#E8A838' : '#E05252'

  if (loading) {
    return <div className="flex items-center justify-center py-20"><RotateCw size={16} className="animate-spin text-[#4B5A7A]" /></div>
  }

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-4 gap-3">
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-lg p-3 text-center">
          <p className="text-xl font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#E8EEF8]">{stats.scheduled_types}</p>
          <p className="text-[10px] text-[#4B5A7A]">Scheduled types</p>
        </div>
        <div className={`bg-[#0D1525] border border-[#1A2035] rounded-lg p-3 text-center ${stats.running > 0 ? 'animate-pulse' : ''}`}>
          <p className="text-xl font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#4BB8F2]">{stats.running}</p>
          <p className="text-[10px] text-[#4B5A7A]">Running now</p>
        </div>
        <div className={`bg-[#0D1525] border rounded-lg p-3 text-center ${stats.failed_today > 0 ? 'border-[#E05252]/30 bg-[#E05252]/5' : 'border-[#1A2035]'}`}>
          <p className={`text-xl font-bold font-[family-name:var(--font-jetbrains-mono)] ${stats.failed_today > 0 ? 'text-[#E05252]' : 'text-[#4BF2A2]'}`}>{stats.failed_today}</p>
          <p className="text-[10px] text-[#4B5A7A]">Failed today</p>
        </div>
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-lg p-3 text-center">
          <p className="text-xl font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: rateColor }}>{stats.success_rate_7d}%</p>
          <p className="text-[10px] text-[#4B5A7A]">Success rate (7d)</p>
        </div>
      </div>

      {/* Schedule Cards by Category */}
      {CATEGORY_ORDER.map(cat => {
        const items = grouped.get(cat)
        if (!items?.length) return null
        return (
          <div key={cat}>
            <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-2">{CATEGORY_LABELS[cat]}</h3>
            <div className="space-y-2">
              {items.map(config => (
                <ScheduleCard
                  key={config.report_type}
                  config={config}
                  onRunNow={handleRunNow}
                  onRetry={handleRetry}
                  onToggle={handleToggle}
                  onViewHistory={() => setHistoryType(config.report_type)}
                />
              ))}
            </div>
          </div>
        )
      })}

      {/* History Drawer */}
      {historyType && (
        <RunHistoryDrawer
          reportType={historyType}
          reportName={configs.find(c => c.report_type === historyType)?.report_name ?? historyType}
          onClose={() => setHistoryType(null)}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}
