'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { CategoryLearningStats } from '@/lib/types'
import { StatCards, type GlobalStats } from './StatCards'
import { CorrectionPatterns, type Pattern } from './CorrectionPatterns'
import { CategoryAccuracy } from './CategoryAccuracy'
import { AcceptanceTrend, type TrendDay } from './AcceptanceTrend'
import { RevisionLog, type LogEntry } from './RevisionLog'
import { AutonomyStatus } from './AutonomyStatus'

export function LearningDashboard() {
  const [stats, setStats] = useState<GlobalStats | null>(null)
  const [categories, setCategories] = useState<CategoryLearningStats[]>([])
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [trend, setTrend] = useState<TrendDay[]>([])
  const [log, setLog] = useState<LogEntry[]>([])
  const [logFilter, setLogFilter] = useState<'all' | 'edited' | 'discarded'>('all')
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    try {
      const [s, c, p, t, l] = await Promise.all([
        fetch('/api/learning/stats').then(r => r.json()),
        fetch('/api/learning/categories').then(r => r.json()),
        fetch('/api/learning/patterns').then(r => r.json()),
        fetch('/api/learning/trend').then(r => r.json()),
        fetch(`/api/learning/log?filter=${logFilter}`).then(r => r.json()),
      ])
      if (s.ok) setStats(s)
      if (c.ok) setCategories(c.categories)
      if (p.ok) setPatterns(p.patterns)
      if (t.ok) setTrend(t.trend)
      if (l.ok) setLog(l.log)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [logFilter])

  useEffect(() => { loadAll() }, [loadAll])

  const handleAutonomyToggle = async (category: string, enabled: boolean) => {
    try {
      await fetch(`/api/learning/categories/${encodeURIComponent(category)}/autonomy`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      })
      toast.success(`Auto-send ${enabled ? 'enabled' : 'disabled'} for ${category}`)
      loadAll()
    } catch { toast.error('Toggle failed') }
  }

  if (loading) {
    return <div className="text-sm text-[#4B5A7A] py-12 text-center">Loading learning data...</div>
  }

  return (
    <div className="space-y-5">
      <StatCards stats={stats} />
      <div className="grid grid-cols-2 gap-3">
        <CorrectionPatterns patterns={patterns} />
        <CategoryAccuracy categories={categories} />
      </div>
      <AcceptanceTrend trend={trend} />
      <RevisionLog log={log} filter={logFilter} onFilterChange={setLogFilter} />
      <AutonomyStatus categories={categories} onToggle={handleAutonomyToggle} />
    </div>
  )
}
