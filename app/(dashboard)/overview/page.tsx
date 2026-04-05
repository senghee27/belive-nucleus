import { getIncidents, getIncidentStats } from '@/lib/incidents'
import Link from 'next/link'
import { AlertTriangle, Clock, Zap, CheckCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const CLUSTER_COLORS: Record<string, string> = { C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838', C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252' }

export default async function OverviewPage() {
  const [stats, p1Incidents] = await Promise.all([
    getIncidentStats(),
    getIncidents({ status: ['new', 'awaiting_lee'], limit: 5 }),
  ])

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 18 ? 'Good afternoon' : 'Good evening'
  const dateStr = new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  const cards = [
    { label: 'New', value: (stats.by_status?.new ?? 0) + (stats.by_status?.analysed ?? 0), color: '#E05252', icon: AlertTriangle },
    { label: 'Awaiting Lee', value: stats.awaiting_lee, color: '#E8A838', icon: Clock },
    { label: 'Acting', value: stats.by_status?.acting ?? 0, color: '#4BB8F2', icon: Zap },
    { label: 'Resolved', value: stats.by_status?.resolved ?? 0, color: '#4BF2A2', icon: CheckCircle },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#E8EEF8]">{greeting}, Lee.</h2>
        <p className="text-sm text-[#4B5A7A] mt-1">{dateStr}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {cards.map(c => {
          const Icon = c.icon
          return (
            <div key={c.label} className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color: c.value > 0 ? c.color : '#4B5A7A' }} />
                <span className="text-xs text-[#4B5A7A]">{c.label}</span>
              </div>
              <p className="text-2xl font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: c.value > 0 ? c.color : '#4B5A7A' }}>{c.value}</p>
            </div>
          )
        })}
      </div>

      {p1Incidents.filter(i => i.priority === 'P1').length > 0 && (
        <div className="bg-[#0D1525] border border-[#E05252]/20 rounded-xl p-4">
          <h3 className="text-sm font-medium text-[#E05252] mb-3">P1 — Needs You Now</h3>
          {p1Incidents.filter(i => i.priority === 'P1').map(i => (
            <Link key={i.id} href="/command" className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#111D30] transition-colors">
              <span className="w-2 h-2 rounded-full bg-[#E05252] animate-pulse shrink-0" />
              {i.cluster && <span className="text-[10px] px-1 py-0.5 rounded" style={{ color: CLUSTER_COLORS[i.cluster], backgroundColor: (CLUSTER_COLORS[i.cluster] ?? '#8A9BB8') + '15' }}>{i.cluster}</span>}
              <span className="text-sm text-[#E8EEF8] truncate">{i.title}</span>
            </Link>
          ))}
        </div>
      )}

      {stats.awaiting_lee > 0 && (
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-[#E8EEF8]">Awaiting Your Decision</h3>
              <p className="text-xs text-[#4B5A7A] mt-1">{stats.awaiting_lee} incident{stats.awaiting_lee !== 1 ? 's' : ''}</p>
            </div>
            <Link href="/command" className="text-xs text-[#F2784B] hover:text-[#E0673D]">View All →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
