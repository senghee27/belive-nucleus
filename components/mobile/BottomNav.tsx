'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Zap, ListChecks, Building2, FileText } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const TABS = [
  { key: 'urgent', label: 'Urgent', icon: Zap, href: '/m', badgeColor: '#E05252' },
  { key: 'queue', label: 'Queue', icon: ListChecks, href: '/m/queue', badgeColor: '#E8A838' },
  { key: 'clusters', label: 'Clusters', icon: Building2, href: '/m/clusters', badgeColor: '#E05252' },
  { key: 'reports', label: 'Reports', icon: FileText, href: '/m/reports', badgeColor: '#E8A838' },
]

export function BottomNav() {
  const pathname = usePathname()
  const [badges, setBadges] = useState<Record<string, number>>({})

  useEffect(() => {
    const fetchBadges = async () => {
      const [p1, queue, clusters, drafts] = await Promise.all([
        supabase.from('incidents').select('id', { count: 'exact', head: true }).eq('priority', 'P1').in('status', ['new', 'analysed', 'awaiting_lee', 'acting']),
        supabase.from('incidents').select('id', { count: 'exact', head: true }).in('status', ['awaiting_lee']),
        supabase.from('cluster_health_cache').select('id', { count: 'exact', head: true }).eq('health_status', 'red'),
        supabase.from('briefing_reports').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      ])
      setBadges({ urgent: p1.count ?? 0, queue: queue.count ?? 0, clusters: clusters.count ?? 0, reports: drafts.count ?? 0 })
    }
    fetchBadges()

    const ch = supabase.channel('mobile-nav')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, fetchBadges)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'briefing_reports' }, fetchBadges)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-[#0D1525] border-t border-[#1A2035]"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="flex items-center justify-around h-14">
        {TABS.map(tab => {
          const isActive = tab.href === '/m' ? pathname === '/m' : pathname.startsWith(tab.href)
          const Icon = tab.icon
          const badge = badges[tab.key] ?? 0
          return (
            <Link key={tab.key} href={tab.href}
              className={`relative flex flex-col items-center justify-center w-16 h-full ${isActive ? 'text-[#F2784B]' : 'text-[#4B5A7A]'}`}>
              {isActive && <span className="absolute top-0 left-3 right-3 h-0.5 bg-[#F2784B] rounded-b" />}
              <Icon size={20} />
              <span className="text-[10px] mt-0.5">{tab.label}</span>
              {badge > 0 && (
                <span className="absolute top-1 right-2 min-w-[16px] h-4 flex items-center justify-center rounded-full text-white text-[9px] font-bold px-1"
                  style={{ backgroundColor: tab.badgeColor }}>
                  {badge > 99 ? '99+' : badge}
                </span>
              )}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
