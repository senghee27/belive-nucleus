'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { Search, LayoutList, LayoutGrid, X, Clock, AlertCircle, Timer, RefreshCw, MapPin, User } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Incident, IncidentStats } from '@/lib/types'
import { ISSUE_CATEGORIES } from '@/lib/types'

const SORT_OPTIONS = [
  { key: 'created_at_desc', label: 'Newest', icon: Clock },
  { key: 'severity', label: 'Severity', icon: AlertCircle },
  { key: 'age_desc', label: 'Longest', icon: Timer },
  { key: 'updated_at_desc', label: 'Updated', icon: RefreshCw },
  { key: 'cluster', label: 'Cluster', icon: MapPin },
  { key: 'owner', label: 'Owner', icon: User },
] as const
type SortKey = typeof SORT_OPTIONS[number]['key']

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

const STAT_STATUS_MAP: Record<string, string[]> = {
  'New': ['new', 'analysed'],
  'Awaiting Lee': ['awaiting_lee'],
  'Acting': ['acting'],
  'Resolved': ['resolved'],
}

type ViewMode = 'table' | 'grouped'
type CommandState = {
  sevFilter: string[]; clusterFilter: string[]; catFilter: string[]; priFilter: string[]
  statusFilter: string[]; search: string; view: ViewMode
  sortBy: string; sortDir: string; scrollY: number; lastSelectedId: string | null
}

function saveCommandState(state: CommandState) {
  try { sessionStorage.setItem('nucleus_command_state', JSON.stringify(state)) } catch { /* ignore */ }
}
function loadCommandState(): CommandState | null {
  try {
    const raw = sessionStorage.getItem('nucleus_command_state')
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function CommandCenter({ initialIncidents, initialStats }: { initialIncidents: Incident[]; initialStats: IncidentStats }) {
  const router = useRouter()
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents)
  const [stats, setStats] = useState<IncidentStats>(initialStats)

  // FIX 3: Restore state from sessionStorage
  const saved = typeof window !== 'undefined' ? loadCommandState() : null
  const [view, setView] = useState<ViewMode>((saved?.view as ViewMode) ?? 'table')
  const [search, setSearch] = useState(saved?.search ?? '')
  const [sevFilter, setSevFilter] = useState<string[]>(saved?.sevFilter ?? [])
  const [clusterFilter, setClusterFilter] = useState<string[]>(saved?.clusterFilter ?? [])
  const [catFilter, setCatFilter] = useState<string[]>(saved?.catFilter ?? [])
  const [priFilter, setPriFilter] = useState<string[]>(saved?.priFilter ?? [])
  const [statusFilter, setStatusFilter] = useState<string[]>(saved?.statusFilter ?? [])
  const [sortBy, setSortBy] = useState<SortKey>(() => {
    try { return (sessionStorage.getItem('nucleus_command_sort') as SortKey) ?? 'created_at_desc' } catch { return 'created_at_desc' }
  })
  const [activeStatPill, setActiveStatPill] = useState<string | null>(null)
  const [lastSelectedId] = useState<string | null>(saved?.lastSelectedId ?? null)

  // FIX 3: Restore scroll position
  useEffect(() => {
    if (saved?.scrollY) {
      requestAnimationFrame(() => {
        window.scrollTo({ top: saved.scrollY, behavior: 'instant' as ScrollBehavior })
      })
    }
    // Flash last selected row
    if (saved?.lastSelectedId) {
      requestAnimationFrame(() => {
        const row = document.querySelector(`[data-incident-id="${saved.lastSelectedId}"]`)
        if (row) {
          row.classList.add('row-flash')
          setTimeout(() => row.classList.remove('row-flash'), 1500)
        }
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
    const sevOrd: Record<string, number> = { RED: 0, YELLOW: 1, GREEN: 2 }
    const priOrd: Record<string, number> = { P1: 0, P2: 1, P3: 2 }
    const clusterOrd = (c: string | null) => {
      if (!c) return 99
      const n = parseInt(c.replace('C', ''))
      return isNaN(n) ? 98 : n
    }
    const unresolvedStatuses = ['new', 'analysed', 'awaiting_lee', 'acting']

    list = [...list].sort((a, b) => {
      switch (sortBy) {
        case 'created_at_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime() || (sevOrd[a.severity] ?? 2) - (sevOrd[b.severity] ?? 2)
        case 'severity': {
          const s = (sevOrd[a.severity] ?? 2) - (sevOrd[b.severity] ?? 2)
          if (s !== 0) return s
          const p = (priOrd[a.priority] ?? 2) - (priOrd[b.priority] ?? 2)
          if (p !== 0) return p
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        }
        case 'age_desc': {
          const aUnresolved = unresolvedStatuses.includes(a.status) ? 0 : 1
          const bUnresolved = unresolvedStatuses.includes(b.status) ? 0 : 1
          if (aUnresolved !== bUnresolved) return aUnresolved - bUnresolved
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        }
        case 'updated_at_desc':
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        case 'cluster': {
          const co = clusterOrd(a.cluster) - clusterOrd(b.cluster)
          if (co !== 0) return co
          return (sevOrd[a.severity] ?? 2) - (sevOrd[b.severity] ?? 2)
        }
        case 'owner': {
          const aName = a.sender_name ?? ''
          const bName = b.sender_name ?? ''
          if (!aName && bName) return 1
          if (aName && !bName) return -1
          const n = aName.localeCompare(bName)
          if (n !== 0) return n
          return (sevOrd[a.severity] ?? 2) - (sevOrd[b.severity] ?? 2)
        }
        default: return 0
      }
    })
    return list
  }, [incidents, sevFilter, clusterFilter, catFilter, priFilter, statusFilter, search, sortBy])

  function toggleFilter(arr: string[], val: string, setter: (v: string[]) => void) {
    setter(arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val])
  }

  // FIX 2: Clickable stat pills
  function handleStatPillClick(label: string) {
    const statuses = STAT_STATUS_MAP[label]
    if (!statuses) return
    if (activeStatPill === label) {
      setActiveStatPill(null)
      setStatusFilter([])
    } else {
      setActiveStatPill(label)
      setStatusFilter(statuses)
    }
  }

  // FIX 3: Save state before navigating
  const handleRowClick = useCallback((id: string) => {
    saveCommandState({
      sevFilter, clusterFilter, catFilter, priFilter, statusFilter, search, view,
      sortBy, sortDir: 'desc', scrollY: window.scrollY, lastSelectedId: id,
    })
    router.push(`/command/${id}`)
  }, [sevFilter, clusterFilter, catFilter, priFilter, statusFilter, search, view, sortBy, router])

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
      {/* FIX 2: Clickable stat pills */}
      <div className="flex items-center gap-2">
        {statPills.map(s => {
          const isActive = activeStatPill === s.label
          return (
            <button key={s.label} onClick={() => handleStatPillClick(s.label)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
                isActive ? 'text-white' : 'bg-[#0D1525] border border-[#1A2035]'
              }`}
              style={isActive ? { backgroundColor: s.color, borderColor: s.color } : {}}>
              <span className="text-sm font-bold font-[family-name:var(--font-jetbrains-mono)]"
                style={{ color: isActive ? 'white' : s.count > 0 ? s.color : '#4B5A7A' }}>{s.count}</span>
              <span className={`text-[10px] ${isActive ? 'text-white/80' : 'text-[#4B5A7A]'}`}>{s.label}</span>
            </button>
          )
        })}
        {activeStatPill && (
          <button onClick={() => { setActiveStatPill(null); setStatusFilter([]) }}
            className="flex items-center gap-1 text-[9px] text-[#4B5A7A] hover:text-[#E8EEF8]">
            <X size={10} /> Clear filter
          </button>
        )}
      </div>

      {/* Filter bar row 1 */}
      <div className="flex flex-wrap gap-1.5">
        {['RED', 'YELLOW', 'GREEN'].map(s => (
          <button key={s} onClick={() => toggleFilter(sevFilter, s, setSevFilter)}
            className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${sevFilter.includes(s) ? '' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}
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

      {/* Filter bar row 2 */}
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
          <button key={s} onClick={() => { toggleFilter(statusFilter, s, setStatusFilter); setActiveStatPill(null) }}
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
        </div>
      </div>

      {/* Sort tabs */}
      <div className="flex flex-wrap gap-1.5">
        {SORT_OPTIONS.map(opt => {
          const isActive = sortBy === opt.key
          const Icon = opt.icon
          return (
            <button key={opt.key} onClick={() => { setSortBy(opt.key); try { sessionStorage.setItem('nucleus_command_sort', opt.key) } catch {} }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
                isActive
                  ? 'bg-[#F2784B]/15 border-[#F2784B]/40 text-[#F2784B]'
                  : 'bg-transparent border-[#1A2035] text-[#4B5A7A] hover:bg-[#0A1020] hover:text-[#E8EEF8]'
              }`}>
              <Icon size={14} />
              {opt.label}
            </button>
          )
        })}
      </div>

      {/* CSS for row flash animation */}
      <style jsx global>{`
        @keyframes rowFlash {
          0% { background-color: rgba(242,120,75,0.2) }
          100% { background-color: transparent }
        }
        .row-flash { animation: rowFlash 1.5s ease-out }
      `}</style>

      {/* Table or Grouped */}
      {view === 'table' ? (
        <WarRoomTable incidents={filtered} onRowClick={handleRowClick} sortKey={sortBy} />
      ) : (
        <GroupedView incidents={filtered} onRowClick={handleRowClick} />
      )}
    </div>
  )
}

function WarRoomTable({ incidents, onRowClick, sortKey }: { incidents: Incident[]; onRowClick: (id: string) => void; sortKey?: string }) {
  if (incidents.length === 0) {
    return <div className="text-center py-16 text-xs text-[#4B5A7A]">No incidents match filters</div>
  }

  // When sort=cluster, find the boundary between clustered and cluster-less
  let clusterDividerIdx = -1
  if (sortKey === 'cluster') {
    clusterDividerIdx = incidents.findIndex(i => !i.cluster)
  }

  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-[#1A2035] text-[9px] text-[#4B5A7A] uppercase tracking-wider">
              <th className="w-6 p-2" />
              <th className="w-14 p-2 text-left">Cluster</th>
              <th className="w-20 p-2 text-left">Unit</th>
              <th className="w-20 p-2 text-left">Category</th>
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
            {incidents.map((inc, idx) => (
              <>
                {idx === clusterDividerIdx && clusterDividerIdx > 0 && (
                  <tr key="cluster-divider">
                    <td colSpan={11} className="py-1.5 px-4">
                      <div className="flex items-center gap-2 text-[10px] text-[#E05252]">
                        <span className="flex-1 h-px bg-[#E05252]/30" />
                        <span>No cluster assigned</span>
                        <span className="flex-1 h-px bg-[#E05252]/30" />
                      </div>
                    </td>
                  </tr>
                )}
                <IncidentRow key={inc.id} incident={inc} onClick={() => onRowClick(inc.id)} />
              </>
            ))}
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
  const catLabel = cat.label.length > 8 ? cat.label.slice(0, 8) + '…' : cat.label

  return (
    <tr onClick={onClick} data-incident-id={i.id}
      className={`border-b border-[#1A2035]/30 cursor-pointer transition-colors hover:bg-[#111D30] group ${isSilent ? 'bg-[rgba(155,109,255,0.06)]' : ''}`}>
      <td className="p-2">
        <span className={`block w-2 h-2 rounded-full ${i.priority === 'P1' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV_COLORS[i.severity] ?? '#4B5A7A' }} />
      </td>
      <td className="p-2">
        {i.cluster ? (
          <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-bold px-1.5 py-0.5 rounded" style={{ color: CLUSTER_COLORS[i.cluster], backgroundColor: (CLUSTER_COLORS[i.cluster] ?? '#4B5A7A') + '15' }}>{i.cluster}</span>
        ) : (
          <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] font-bold px-1.5 py-0.5 rounded border border-[#E05252] bg-[#E05252]/10 text-[#E05252]" title="No cluster assigned — needs triage">—</span>
        )}
      </td>
      <td className="p-2">
        <span className="text-[11px] font-[family-name:var(--font-jetbrains-mono)] text-[#8A9BB8]">{unit}</span>
      </td>
      {/* FIX 1: Category with icon + label */}
      <td className="p-2" title={cat.label}>
        <span className="text-[11px] text-[#4B5A7A] whitespace-nowrap">{cat.icon} {catLabel}</span>
      </td>
      {/* FIX 1: Issue wraps to 2 lines */}
      <td className="p-2">
        <span className="text-[12px] text-[#E8EEF8] leading-snug" style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
          {i.title}
        </span>
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
      <td className="p-2 text-center">
        <span className="text-[#4B5A7A] opacity-0 group-hover:opacity-100 transition-opacity">→</span>
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
                <table className="w-full min-w-[960px]">
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
