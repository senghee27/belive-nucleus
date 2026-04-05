'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { AnimatePresence } from 'framer-motion'
import { AlertTriangle, CheckCircle } from 'lucide-react'
import { IssueDrawer } from './IssueDrawer'
import type { Issue, IssueStats } from '@/lib/issues'
import { CLUSTER_COLORS } from '@/lib/issues'
import { formatDistanceToNow } from 'date-fns'

const SEV_COLORS: Record<string, string> = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }

type ClusterFilter = 'all' | 'C1' | 'C2' | 'C11'
type SevFilter = 'all' | 'RED' | 'YELLOW' | 'GREEN'

export function IssuesDashboard({ initialIssues, initialStats }: { initialIssues: Issue[]; initialStats: IssueStats }) {
  const [issues, setIssues] = useState<Issue[]>(initialIssues)
  const [stats, setStats] = useState<IssueStats>(initialStats)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [cluster, setCluster] = useState<ClusterFilter>('all')
  const [sev, setSev] = useState<SevFilter>('all')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel('issues-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lark_issues' }, () => {
        fetch('/api/issues').then(r => r.json()).then(d => {
          if (d.ok) { setIssues(d.issues); setStats(d.stats) }
        })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleAction = useCallback(async (id: string, action: string, payload?: Record<string, unknown>) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/issues/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      if (!res.ok) throw new Error('Failed')
      toast.success(action === 'follow_up' ? 'Follow-up sent' : action === 'escalate' ? 'Escalated' : 'Issue resolved')
      if (action !== 'follow_up') setSelectedId(null)
      // Refresh
      const data = await fetch('/api/issues').then(r => r.json())
      if (data.ok) { setIssues(data.issues); setStats(data.stats) }
    } catch {
      toast.error('Action failed')
    } finally {
      setLoading(false)
    }
  }, [])

  const filtered = issues
    .filter(i => cluster === 'all' || i.cluster === cluster)
    .filter(i => sev === 'all' || i.severity === sev)
    .sort((a, b) => {
      const sevOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
      return (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2)
    })

  const selected = issues.find(i => i.id === selectedId) ?? null
  const clusters: ClusterFilter[] = ['all', 'C1', 'C2', 'C11']
  const sevs: SevFilter[] = ['all', 'RED', 'YELLOW', 'GREEN']

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#E8EEF8]">Issues</h2>
        <div className="flex items-center gap-3 text-xs">
          {stats.red > 0 && (
            <span className="flex items-center gap-1 text-[#E05252]">
              <span className="w-2 h-2 rounded-full bg-[#E05252] animate-pulse" />
              {stats.red} RED
            </span>
          )}
          <span className="text-[#4B5A7A]">{stats.total} open</span>
        </div>
      </div>

      {/* Cluster summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {['C1', 'C2', 'C11'].map(c => {
          const cs = stats.byCluster[c] ?? { red: 0, yellow: 0, green: 0 }
          const total = cs.red + cs.yellow + cs.green
          const color = CLUSTER_COLORS[c]
          return (
            <button
              key={c}
              onClick={() => setCluster(c as ClusterFilter)}
              className={`bg-[#0D1525] border rounded-xl p-4 text-left transition-colors ${
                cluster === c ? 'border-[#F2784B]' : 'border-[#1A2035] hover:border-[#243050]'
              } ${cs.red > 0 ? 'shadow-[0_0_15px_rgba(224,82,82,0.1)]' : ''}`}
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium text-[#E8EEF8]">{c}</span>
                <span className="text-[10px] text-[#4B5A7A]">
                  {c === 'C1' ? 'JB' : c === 'C2' ? 'Penang' : 'M Vertica'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: cs.red > 0 ? '#E05252' : '#E8EEF8' }}>
                  {total}
                </span>
                <div className="flex gap-1">
                  {cs.red > 0 && <span className="text-[9px] px-1 rounded bg-[#E05252]/15 text-[#E05252]">{cs.red}R</span>}
                  {cs.yellow > 0 && <span className="text-[9px] px-1 rounded bg-[#E8A838]/15 text-[#E8A838]">{cs.yellow}Y</span>}
                  {cs.green > 0 && <span className="text-[9px] px-1 rounded bg-[#4BF2A2]/15 text-[#4BF2A2]">{cs.green}G</span>}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {clusters.map(c => (
          <button key={c} onClick={() => setCluster(c)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${cluster === c ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {c === 'all' ? 'All Clusters' : c}
          </button>
        ))}
        <span className="w-px h-4 bg-[#1A2035] mx-1 self-center" />
        {sevs.map(s => (
          <button key={s} onClick={() => setSev(s)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${sev === s ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {s === 'all' ? 'All' : s}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CheckCircle size={36} className="text-[#4BF2A2]/30 mb-3" />
          <p className="text-sm text-[#4B5A7A]">No open issues. All clear.</p>
        </div>
      ) : (
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="border-b border-[#1A2035]">
                  <th className="w-10 p-3" />
                  <th className="w-16 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Cluster</th>
                  <th className="p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Issue</th>
                  <th className="w-24 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Owner</th>
                  <th className="w-16 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Age</th>
                  <th className="w-12 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Pri</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(issue => {
                  const isOverdue = issue.escalation_due_at && new Date(issue.escalation_due_at).getTime() < Date.now()
                  return (
                    <tr key={issue.id}
                      onClick={() => setSelectedId(issue.id)}
                      className={`border-b border-[#1A2035]/50 cursor-pointer transition-colors ${
                        selectedId === issue.id ? 'bg-[#0F1829] border-l-[3px] border-l-[#F2784B]' : 'hover:bg-[#0A1020]'
                      }`}>
                      <td className="p-3">
                        <span className={`block w-2.5 h-2.5 rounded-full ${issue.severity === 'RED' ? 'animate-pulse' : ''}`}
                          style={{ backgroundColor: SEV_COLORS[issue.severity] ?? '#4B5A7A' }} />
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{ color: CLUSTER_COLORS[issue.cluster] ?? '#8A9BB8', backgroundColor: (CLUSTER_COLORS[issue.cluster] ?? '#8A9BB8') + '15' }}>
                          {issue.cluster}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-[#E8EEF8] line-clamp-1">{issue.title}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-xs text-[#8A9BB8]">{issue.owner_name ?? 'Unassigned'}</span>
                      </td>
                      <td className="p-3">
                        <span className={`text-[11px] font-[family-name:var(--font-jetbrains-mono)] ${isOverdue ? 'text-[#E05252]' : 'text-[#4B5A7A]'}`}>
                          {formatDistanceToNow(new Date(issue.created_at), { addSuffix: false })}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                          style={{ color: issue.priority === 'P1' ? '#E05252' : issue.priority === 'P2' ? '#E8A838' : '#4B5A7A',
                            backgroundColor: (issue.priority === 'P1' ? '#E05252' : issue.priority === 'P2' ? '#E8A838' : '#4B5A7A') + '15' }}>
                          {issue.priority}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <AnimatePresence>
        {selected && (
          <IssueDrawer issue={selected} onClose={() => setSelectedId(null)} onAction={handleAction} loading={loading} />
        )}
      </AnimatePresence>
    </div>
  )
}
