'use client'

import { useEffect, useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Search, LayoutList, LayoutGrid } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Incident, IncidentStats } from '@/lib/types'
import { ISSUE_CATEGORIES } from '@/lib/types'

const SEV_COLORS: Record<string, string> = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }
const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  new: { bg: '#E05252', text: '#E05252', label: 'NEW' },
  awaiting_lee: { bg: '#E8A838', text: '#E8A838', label: '⚡ LEE' },
  acting: { bg: '#4BB8F2', text: '#4BB8F2', label: 'ACTING' },
  analysed: { bg: '#9B6DFF', text: '#9B6DFF', label: 'ANALYSED' },
  resolved: { bg: '#4BF2A2', text: '#4BF2A2', label: 'DONE' },
  archived: { bg: '#4B5A7A', text: '#4B5A7A', label: 'ARCHIVED' },
}

type ViewMode = 'table' | 'grouped'

export function CommandCenter({ initialIncidents, initialStats }: { initialIncidents: Incident[]; initialStats: IncidentStats }) {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents)
  const [stats, setStats] = useState<IncidentStats>(initialStats)
  const [view, setView] = useState<ViewMode>('table')
  const [search, setSearch] = useState('')
  const [sevFilter, setSevFilter] = useState<string[]>([])
  const [clusterFilter, setClusterFilter] = useState<string[]>([])
  const [catFilter, setCatFilter] = useState<string[]>([])
  const [priFilter, setPriFilter] = useState<string[]>([])
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [sortBy, setSortBy] = useState<'severity' | 'created' | 'updated'>('severity')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  useEffect(() => {
    const ch = supabase.channel('command-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        fetch('/api/incidents?limit=100').then(r => r.json()).then(d => {
          if (d.ok) { setIncidents(d.incidents); setStats(d.stats) }
        })
      }).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const filtered = useMemo(() => {
    let list = incidents
    if (sevFilter.length > 0) list = list.filter(i => sevFilter.includes(i.severity))
    if (clusterFilter.length > 0) list = list.filter(i => i.cluster && clusterFilter.includes(i.cluster))
    if (catFilter.length > 0) list = list.filter(i => catFilter.includes((i as Record<string, unknown>).category as string ?? 'other'))
    if (priFilter.length > 0) list = list.filter(i => priFilter.includes(i.priority))
    if (statusFilter.length > 0) list = list.filter(i => statusFilter.includes(i.status))
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.raw_content.toLowerCase().includes(q) || (i.sender_name ?? '').toLowerCase().includes(q) || (i.cluster ?? '').toLowerCase().includes(q))
    }
    // Sort
    list = [...list].sort((a, b) => {
      if (sortBy === 'severity') {
        const sevOrder: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
        const diff = (sevOrder[a.severity] ?? 2) - (sevOrder[b.severity] ?? 2)
        if (diff !== 0) return diff
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      }
      if (sortBy === 'created') return sortDir === 'desc' ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime() : new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      if (sortBy === 'updated') return sortDir === 'desc' ? new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime() : new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime()
      return 0
    })
    return list
  }, [incidents, sevFilter, clusterFilter, catFilter, priFilter, statusFilter, search, sortBy, sortDir])

  function toggleFilter(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  const statPills = [
    { label: 'New', count: (stats.by_status?.new ?? 0) + (stats.by_status?.analysed ?? 0), color: '#E05252' },
    { label: 'Awaiting Lee', count: stats.awaiting_lee, color: '#E8A838' },
    { label: 'Acting', count: stats.by_status?.acting ?? 0, color: '#4BB8F2' },
    { label: 'Resolved', count: stats.by_status?.resolved ?? 0, color: '#4BF2A2' },
  ]

  const clusters = ['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11']
  const topCategories = ['air_con','plumbing','electrical','move_in','move_out','cleaning','general_repair','access_card','safety']

  return (
    <div className="space-y-3">
      {/* Stat pills */}
      <div className="flex gap-2">
        {statPills.map(s => (
          <div key={s.label} className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0D1525] border border-[#1A2035] rounded-lg">
            <span className="text-sm font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: s.count > 0 ? s.color : '#4B5A7A' }}>{s.count}</span>
            <span className="text-[10px] text-[#4B5A7A]">{s.label}</span>
          </div>
        ))}
      </div>

      {/* Filter bar row 1: severity + clusters */}
      <div className="flex flex-wrap gap-1.5">
        {['RED', 'YELLOW', 'GREEN'].map(s => (
          <button key={s} onClick={() => toggleFilter(sevFilter, s, setSevFilter)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sevFilter.includes(s) ? 'text-white' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}
            style={sevFilter.includes(s) ? { backgroundColor: SEV_COLORS[s] + '30', color: SEV_COLORS[s] } : {}}>
            {s === 'RED' ? '🔴' : s === 'YELLOW' ? '🟡' : '🟢'} {s}
          </button>
        ))}
        <span className="w-px h-5 bg-[#1A2035] self-center mx-1" />
        {clusters.map(c => (
          <button key={c} onClick={() => toggleFilter(clusterFilter, c, setClusterFilter)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-bold transition-colors ${clusterFilter.includes(c) ? '' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}
            style={clusterFilter.includes(c) ? { color: CLUSTER_COLORS[c], backgroundColor: CLUSTER_COLORS[c] + '20' } : {}}>
            {c}
          </button>
        ))}
      </div>

      {/* Filter bar row 2: categories + priority + status */}
      <div className="flex flex-wrap gap-1.5">
        {topCategories.map(cat => {
          const catInfo = ISSUE_CATEGORIES[cat]
          return (
            <button key={cat} onClick={() => toggleFilter(catFilter, cat, setCatFilter)}
              className={`px-2 py-0.5 rounded text-[10px] transition-colors ${catFilter.includes(cat) ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}
              title={catInfo?.label}>
              {catInfo?.icon} {catInfo?.label}
            </button>
          )
        })}
        <span className="w-px h-5 bg-[#1A2035] self-center mx-1" />
        {['P1', 'P2', 'P3'].map(p => (
          <button key={p} onClick={() => toggleFilter(priFilter, p, setPriFilter)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium ${priFilter.includes(p) ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {p}
          </button>
        ))}
        <span className="w-px h-5 bg-[#1A2035] self-center mx-1" />
        {['new', 'awaiting_lee', 'acting', 'resolved'].map(s => (
          <button key={s} onClick={() => toggleFilter(statusFilter, s, setStatusFilter)}
            className={`px-2 py-0.5 rounded text-[10px] ${statusFilter.includes(s) ? 'text-[#F2784B] bg-[#F2784B]/15' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {STATUS_STYLES[s]?.label ?? s}
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-[#4B5A7A]">{filtered.length} incidents</span>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#4B5A7A]" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search..." className="pl-7 pr-3 py-1 bg-[#080E1C] border border-[#1A2035] rounded-lg text-[11px] text-[#E8EEF8] w-40 focus:outline-none focus:border-[#F2784B]/50 placeholder:text-[#2A3550]" />
          </div>
          <div className="flex bg-[#080E1C] border border-[#1A2035] rounded-lg overflow-hidden">
            <button onClick={() => setView('table')} className={`px-2 py-1 ${view === 'table' ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A]'}`}><LayoutList size={13} /></button>
            <button onClick={() => setView('grouped')} className={`px-2 py-1 ${view === 'grouped' ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A]'}`}><LayoutGrid size={13} /></button>
          </div>
          <select value={sortBy} onChange={e => setSortBy(e.target.value as 'severity' | 'created' | 'updated')}
            className="bg-[#080E1C] border border-[#1A2035] rounded-lg text-[10px] text-[#8A9BB8] px-2 py-1">
            <option value="severity">Sort: Severity</option>
            <option value="created">Sort: Created</option>
            <option value="updated">Sort: Updated</option>
          </select>
        </div>
      </div>

      {/* Table or Grouped View */}
      {view === 'table' ? (
        <WarRoomTable incidents={filtered} onRowClick={(id) => router.push(`/command/${id}`)} />
      ) : (
        <GroupedView incidents={filtered} onRowClick={(id) => router.push(`/command/${id}`)} />
      )}
    </div>
  )
}

function WarRoomTable({ incidents, onRowClick }: { incidents: Incident[]; onRowClick: (id: string) => void }) {
  if (incidents.length === 0) {
    return <div className="text-center py-16 text-xs text-[#4B5A7A]">No incidents match filters</div>
  }

  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px]">
          <thead>
            <tr className="border-b border-[#1A2035] text-[9px] text-[#4B5A7A] uppercase tracking-wider">
              <th className="w-6 p-2" />
              <th className="w-14 p-2 text-left">Cluster</th>
              <th className="w-20 p-2 text-left">Unit</th>
              <th className="w-7 p-2" title="Category">Cat</th>
              <th className="p-2 text-left">Issue</th>
              <th className="w-16 p-2 text-left">Owner</th>
              <th className="w-10 p-2">Pri</th>
              <th className="w-16 p-2">Status</th>
              <th className="w-20 p-2 text-left">Created</th>
              <th className="w-20 p-2 text-left">Updated</th>
              <th className="w-8 p-2" />
            </tr>
          </thead>
          <tbody>
            {incidents.map(inc => <IncidentRow key={inc.id} incident={inc} onClick={() => onRowClick(inc.id)} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function IncidentRow({ incident: i, onClick }: { incident: Incident; onClick: () => void }) {
  const cat = ISSUE_CATEGORIES[(i as Record<string, unknown>).category as string ?? 'other'] ?? ISSUE_CATEGORIES.other
  const status = STATUS_STYLES[i.status] ?? STATUS_STYLES.new
  const isSilent = (i as Record<string, unknown>).incident_type === 'silent_ticket'
  const unitMatch = i.title.match(/[A-Z]?-?\d{1,3}-?\d{1,3}[A-Z]?/i)
  const unit = unitMatch?.[0] ?? '—'

  const createdAge = formatDistanceToNow(new Date(i.created_at), { addSuffix: false })
  const updatedAge = formatDistanceToNow(new Date(i.updated_at), { addSuffix: false })
  const createdHours = (Date.now() - new Date(i.created_at).getTime()) / 3600000
  const updatedHours = (Date.now() - new Date(i.updated_at).getTime()) / 3600000

  return (
    <tr onClick={onClick}
      className={`border-b border-[#1A2035]/30 cursor-pointer transition-colors h-9 hover:bg-[#111D30] ${isSilent ? 'bg-[rgba(155,109,255,0.06)]' : ''}`}>
      <td className="p-2">
        <span className={`block w-2 h-2 rounded-full ${i.priority === 'P1' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV_COLORS[i.severity] ?? '#4B5A7A' }} />
      </td>
      <td className="p-2">
        {i.cluster && <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-bold px-1.5 py-0.5 rounded" style={{ color: CLUSTER_COLORS[i.cluster], backgroundColor: (CLUSTER_COLORS[i.cluster] ?? '#4B5A7A') + '15' }}>{i.cluster}</span>}
      </td>
      <td className="p-2">
        <span className="text-[11px] font-[family-name:var(--font-jetbrains-mono)] text-[#8A9BB8]">{unit}</span>
      </td>
      <td className="p-2 text-center" title={cat.label}>
        <span className="text-sm">{cat.icon}</span>
      </td>
      <td className="p-2">
        <span className="text-[12px] text-[#E8EEF8] truncate block max-w-[220px]" title={i.title}>{i.title.slice(0, 40)}{i.title.length > 40 ? '…' : ''}</span>
      </td>
      <td className="p-2">
        <span className="text-[11px] text-[#8A9BB8]">{i.sender_name?.split(' ')[0] ?? '—'}</span>
      </td>
      <td className="p-2 text-center">
        <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ color: i.priority === 'P1' ? '#E05252' : i.priority === 'P2' ? '#E8A838' : '#4B5A7A', backgroundColor: (i.priority === 'P1' ? '#E05252' : i.priority === 'P2' ? '#E8A838' : '#4B5A7A') + '20' }}>{i.priority}</span>
      </td>
      <td className="p-2 text-center">
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded ${isSilent ? 'animate-pulse' : ''}`} style={{ color: status.text, backgroundColor: status.bg + '15' }}>{isSilent ? 'SILENT' : status.label}</span>
      </td>
      <td className="p-2">
        <span className={`text-[10px] ${createdHours > 72 ? 'text-[#E05252]' : createdHours > 24 ? 'text-[#E8A838]' : 'text-[#4B5A7A]'}`} title={new Date(i.created_at).toLocaleString('en-MY')}>{createdAge}</span>
      </td>
      <td className="p-2">
        <span className={`text-[10px] ${updatedHours > 72 ? 'text-[#E05252]' : updatedHours > 24 ? 'text-[#E8A838]' : 'text-[#4B5A7A]'}`} title={new Date(i.updated_at).toLocaleString('en-MY')}>{updatedAge}</span>
      </td>
      <td className="p-2 text-center opacity-0 group-hover:opacity-100">
        <span className="text-[#4B5A7A]">→</span>
      </td>
    </tr>
  )
}

function GroupedView({ incidents, onRowClick }: { incidents: Incident[]; onRowClick: (id: string) => void }) {
  const groups = [
    { key: 'new', label: '🔴 NEW', items: incidents.filter(i => i.status === 'new' || i.status === 'analysed') },
    { key: 'awaiting', label: '⚡ AWAITING LEE', items: incidents.filter(i => i.status === 'awaiting_lee'), note: 'act now' },
    { key: 'acting', label: '🔵 ACTING', items: incidents.filter(i => i.status === 'acting') },
    { key: 'resolved', label: '✅ RESOLVED', items: incidents.filter(i => i.status === 'resolved'), collapsed: true },
  ]
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  return (
    <div className="space-y-4">
      {groups.map(g => {
        if (g.items.length === 0) return null
        const isCollapsed = g.collapsed && !expanded[g.key]
        return (
          <div key={g.key}>
            <button onClick={() => setExpanded(prev => ({ ...prev, [g.key]: !prev[g.key] }))}
              className="flex items-center gap-2 mb-2 w-full text-left">
              <span className="text-xs font-medium text-[#E8EEF8]">{g.label}</span>
              <span className="text-[10px] text-[#4B5A7A]">· {g.items.length}</span>
              {g.note && <span className="text-[9px] text-[#E8A838] bg-[#E8A838]/10 px-1.5 rounded">{g.note}</span>}
            </button>
            {!isCollapsed && (
              <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl overflow-hidden">
                <table className="w-full min-w-[900px]">
                  <tbody>
                    {g.items.map(inc => <IncidentRow key={inc.id} incident={inc} onClick={() => onRowClick(inc.id)} />)}
                  </tbody>
                </table>
              </div>
            )}
            {isCollapsed && (
              <p className="text-[10px] text-[#4B5A7A] pl-4">Click to expand · {g.items.length} incidents</p>
            )}
          </div>
        )
      })}
    </div>
  )
}
