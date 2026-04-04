import { supabaseAdmin } from '@/lib/supabase-admin'
import Link from 'next/link'
import { AlertTriangle, Inbox, Zap, Send } from 'lucide-react'

export const dynamic = 'force-dynamic'

const AGENT_COLORS: Record<string, string> = {
  ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2',
}

async function getStats() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [p1Pending, totalPending, autoToday, sentToday, p1Decisions] = await Promise.all([
    supabaseAdmin
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .eq('priority', 'P1')
      .eq('status', 'pending'),
    supabaseAdmin
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .eq('auto_executed', true)
      .gte('created_at', today.toISOString()),
    supabaseAdmin
      .from('decisions')
      .select('id', { count: 'exact', head: true })
      .not('sent_at', 'is', null)
      .gte('sent_at', today.toISOString()),
    supabaseAdmin
      .from('decisions')
      .select('id, ai_summary, agent, created_at')
      .eq('priority', 'P1')
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(5),
  ])

  return {
    p1Count: p1Pending.count ?? 0,
    pendingCount: totalPending.count ?? 0,
    autoCount: autoToday.count ?? 0,
    sentCount: sentToday.count ?? 0,
    p1Decisions: p1Decisions.data ?? [],
  }
}

export default async function OverviewPage() {
  const { p1Count, pendingCount, autoCount, sentCount, p1Decisions } = await getStats()

  const greeting = new Date().getHours() < 12
    ? 'Good morning'
    : new Date().getHours() < 18
      ? 'Good afternoon'
      : 'Good evening'

  const dateStr = new Date().toLocaleDateString('en-MY', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const stats = [
    { label: 'P1 Alerts', value: p1Count, color: p1Count > 0 ? '#E05252' : '#4B5A7A', icon: AlertTriangle },
    { label: 'Pending', value: pendingCount, color: '#E8A838', icon: Inbox },
    { label: 'Auto-handled', value: autoCount, color: '#4BF2A2', icon: Zap },
    { label: 'Sent Today', value: sentCount, color: '#8A9BB8', icon: Send },
  ]

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-[#E8EEF8]">{greeting}, Lee.</h2>
        <p className="text-sm text-[#4B5A7A] mt-1">{dateStr}</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((stat) => {
          const Icon = stat.icon
          return (
            <div key={stat.label} className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} style={{ color: stat.color }} />
                <span className="text-xs text-[#4B5A7A]">{stat.label}</span>
              </div>
              <p className="text-2xl font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: stat.color }}>
                {stat.value}
              </p>
            </div>
          )
        })}
      </div>

      {p1Decisions.length > 0 && (
        <div className="bg-[#0D1525] border border-[#E05252]/20 rounded-xl p-4">
          <h3 className="text-sm font-medium text-[#E05252] mb-3">Needs Your Attention</h3>
          <div className="space-y-2">
            {p1Decisions.map((d) => (
              <Link key={d.id} href="/inbox" className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#111D30] transition-colors">
                <span className="w-2 h-2 rounded-full bg-[#E05252] shrink-0" />
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ color: AGENT_COLORS[d.agent] ?? '#8A9BB8', backgroundColor: (AGENT_COLORS[d.agent] ?? '#8A9BB8') + '15' }}>
                  {d.agent?.toUpperCase()}
                </span>
                <span className="text-sm text-[#E8EEF8] truncate">{d.ai_summary}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-medium text-[#E8EEF8]">Pending Approval</h3>
              <p className="text-xs text-[#4B5A7A] mt-1">{pendingCount} decision{pendingCount !== 1 ? 's' : ''} waiting</p>
            </div>
            <Link href="/inbox" className="text-xs text-[#F2784B] hover:text-[#E0673D] transition-colors">View All →</Link>
          </div>
        </div>
      )}
    </div>
  )
}
