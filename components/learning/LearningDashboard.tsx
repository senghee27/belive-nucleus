'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { CategoryLearningStats } from '@/lib/types'

type GlobalStats = {
  total: number
  approvedV1: number
  approvedEdited: number
  discarded: number
  acceptanceRate: number
  editRate: number
  discardRate: number
}

type Pattern = { tag: string; count: number }
type TrendDay = { date: string; total: number; approved: number; rate: number }
type LogEntry = {
  id: string
  incident_id: string
  title: string
  cluster: string | null
  category: string
  version_number: number
  outcome: string
  decided_at: string
  feedback_tags: string[]
}

export function LearningDashboard() {
  const router = useRouter()
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

  const accuracyColor = (rate: number) => rate >= 80 ? '#4BF2A2' : rate >= 50 ? '#E8A838' : '#E05252'
  const trendBarColor = (rate: number) => rate >= 70 ? '#4BF2A2' : rate >= 50 ? '#E8A838' : '#E05252'

  if (loading) {
    return <div className="text-sm text-[#4B5A7A] py-12 text-center">Loading learning data...</div>
  }

  return (
    <div className="space-y-5">
      {/* 1. Stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard label="Total Proposals" value={stats?.total ?? 0} pct={null} color="#E8EEF8" />
        <StatCard label="Sent as-is (v1)" value={stats?.approvedV1 ?? 0} pct={stats?.acceptanceRate ?? 0} color="#4BF2A2" />
        <StatCard label="Edited before send" value={stats?.approvedEdited ?? 0} pct={stats?.editRate ?? 0} color="#E8A838" />
        <StatCard label="Discarded" value={stats?.discarded ?? 0} pct={stats?.discardRate ?? 0} color="#E05252" />
      </div>

      {/* 2. Two-column: patterns + accuracy */}
      <div className="grid grid-cols-2 gap-3">
        {/* Top correction patterns */}
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
          <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Top Correction Patterns</h3>
          {patterns.length === 0 ? (
            <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No patterns yet</p>
          ) : (
            <div className="space-y-2">
              {patterns.slice(0, 6).map(p => {
                const max = patterns[0].count
                const width = Math.round((p.count / max) * 100)
                return (
                  <div key={p.tag} className="flex items-center gap-2">
                    <span className="text-[11px] text-[#E8EEF8] w-32 truncate">{p.tag}</span>
                    <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                      <div className="h-full bg-[#E8A838] rounded-full" style={{ width: `${width}%` }} />
                    </div>
                    <span className="text-[11px] text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)] w-8 text-right">{p.count}x</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Accuracy by category */}
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
          <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Accuracy by Category</h3>
          {categories.length === 0 ? (
            <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No data yet</p>
          ) : (
            <div className="space-y-2">
              {categories.slice(0, 8).map(c => (
                <div key={c.category} className="flex items-center gap-2">
                  <span className="text-[11px] text-[#E8EEF8] w-32 truncate capitalize">{c.category.replace(/_/g, ' ')}</span>
                  <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${c.acceptance_rate}%`, backgroundColor: accuracyColor(c.acceptance_rate) }} />
                  </div>
                  <span className="text-[11px] font-[family-name:var(--font-jetbrains-mono)] w-10 text-right" style={{ color: accuracyColor(c.acceptance_rate) }}>
                    {Math.round(c.acceptance_rate)}%
                  </span>
                  {c.auto_send_enabled && <span className="text-[8px] text-[#4BF2A2]">✓</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. Acceptance trend */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Acceptance Trend (30 days)</h3>
        {trend.length === 0 ? (
          <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No trend data yet</p>
        ) : (
          <div className="flex items-end gap-1 h-20">
            {trend.map(d => (
              <div key={d.date} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${d.approved}/${d.total} (${d.rate}%)`}>
                <div className="w-full rounded-t" style={{ height: `${Math.max(d.rate, 4)}%`, backgroundColor: trendBarColor(d.rate) }} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 4. Revision log */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold">Revision Log</h3>
          <div className="flex gap-1">
            {(['all', 'edited', 'discarded'] as const).map(f => (
              <button key={f} onClick={() => setLogFilter(f)}
                className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                  logFilter === f ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'
                }`}>
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
        {log.length === 0 ? (
          <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No entries yet</p>
        ) : (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {log.map(entry => {
              const outcomeColor = entry.outcome === 'discarded' ? '#E05252' : entry.outcome === 'edited' ? '#E8A838' : '#4BF2A2'
              const outcomeLabel = entry.outcome === 'discarded' ? 'Discarded' : entry.outcome === 'edited' ? `Sent v${entry.version_number}` : `Sent v1`
              return (
                <button key={entry.id} onClick={() => router.push(`/command/${entry.incident_id}`)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#111D30] text-left text-[11px]">
                  <span className="text-[#E8EEF8] truncate flex-1">{entry.title}</span>
                  {entry.cluster && <span className="text-[9px] text-[#8A9BB8]">{entry.cluster}</span>}
                  <span className="text-[9px] text-[#4B5A7A] w-20 truncate">{entry.category}</span>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: outcomeColor, backgroundColor: `${outcomeColor}15` }}>
                    {outcomeLabel}
                  </span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* 5. Autonomy status */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Autonomy Status</h3>
        {categories.length === 0 ? (
          <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No categories yet</p>
        ) : (
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] text-[#4B5A7A] uppercase tracking-wider border-b border-[#1A2035]">
                <th className="text-left pb-2">Category</th>
                <th className="text-right pb-2">Rate</th>
                <th className="text-right pb-2">Last 20</th>
                <th className="text-right pb-2">Streak</th>
                <th className="text-right pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => {
                const last20Approved = (c.last_20_outcomes ?? []).filter(o => o === 'approved').length
                const last20Total = (c.last_20_outcomes ?? []).length
                return (
                  <tr key={c.category} className="border-b border-[#1A2035]/30">
                    <td className="py-2 text-[#E8EEF8] capitalize">{c.category.replace(/_/g, ' ')}</td>
                    <td className="py-2 text-right font-[family-name:var(--font-jetbrains-mono)]" style={{ color: accuracyColor(c.acceptance_rate) }}>
                      {Math.round(c.acceptance_rate)}%
                    </td>
                    <td className="py-2 text-right text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{last20Approved}/{last20Total}</td>
                    <td className="py-2 text-right text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{c.consecutive_approvals}</td>
                    <td className="py-2 text-right">
                      {c.auto_send_enabled ? (
                        <button onClick={() => handleAutonomyToggle(c.category, false)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[#4BF2A2]/15 text-[#4BF2A2]">Auto ✓</button>
                      ) : c.auto_send_eligible ? (
                        <button onClick={() => handleAutonomyToggle(c.category, true)}
                          className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8A838]/15 text-[#E8A838]">Eligible</button>
                      ) : (
                        <span className="text-[10px] text-[#4B5A7A]">Manual</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function StatCard({ label, value, pct, color }: { label: string; value: number; pct: number | null; color: string }) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-3 text-center">
      <p className="text-[22px] font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#4B5A7A] mt-0.5">{label}</p>
      {pct !== null && (
        <p className="text-[9px] text-[#8A9BB8] mt-0.5">{pct}%</p>
      )}
    </div>
  )
}
