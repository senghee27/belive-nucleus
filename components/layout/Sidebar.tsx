'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Home,
  Inbox,
  User,
  DollarSign,
  Settings,
  Code,
  Brain,
  Wrench,
  AlertTriangle,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

const NAV_ITEMS = [
  { href: '/overview', icon: Home, label: 'Overview' },
  { href: '/inbox', icon: Inbox, label: 'Inbox', showBadge: true },
  { href: '/ceo', icon: User, label: 'CEO', color: '#9B6DFF' },
  { href: '/cfo', icon: DollarSign, label: 'CFO', color: '#4BB8F2' },
  { href: '/coo', icon: Settings, label: 'COO', color: '#F2784B' },
  { href: '/cto', icon: Code, label: 'CTO', color: '#4BF2A2' },
  { href: '/issues', icon: AlertTriangle, label: 'Issues', showRedBadge: true },
  { href: '/memory', icon: Brain, label: 'Memory' },
  { href: '/settings', icon: Wrench, label: 'Settings' },
]

export function Sidebar() {
  const pathname = usePathname()
  const [pendingCount, setPendingCount] = useState(0)
  const [redCount, setRedCount] = useState(0)

  useEffect(() => {
    supabase.from('decisions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
      .then(({ count }) => setPendingCount(count ?? 0))
    supabase.from('lark_issues').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('severity', 'RED')
      .then(({ count }) => setRedCount(count ?? 0))

    const channel = supabase.channel('sidebar-counts')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'decisions' }, () => {
        supabase.from('decisions').select('id', { count: 'exact', head: true }).eq('status', 'pending')
          .then(({ count }) => setPendingCount(count ?? 0))
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'lark_issues' }, () => {
        supabase.from('lark_issues').select('id', { count: 'exact', head: true }).eq('status', 'open').eq('severity', 'RED')
          .then(({ count }) => setRedCount(count ?? 0))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-14 flex-col bg-[#0D1525] border-r border-[#1A2035] h-full">
        <div className="flex items-center justify-center h-13 border-b border-[#1A2035]">
          <span className="text-[#F2784B] font-bold text-sm">N</span>
        </div>

        <nav className="flex-1 flex flex-col items-center gap-1 py-3">
          {NAV_ITEMS.map((item) => {
            const isActive = item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`relative flex items-center justify-center w-10 h-10 rounded-lg transition-colors ${
                  isActive
                    ? 'bg-[#F2784B]/10 text-[#F2784B] border-l-2 border-[#F2784B]'
                    : 'text-[#4B5A7A] hover:text-[#8A9BB8] hover:bg-[#111D30]'
                }`}
                title={item.label}
              >
                <Icon size={18} />
                {item.showBadge && pendingCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#F2784B] text-white text-[9px] font-bold px-1">
                    {pendingCount}
                  </span>
                )}
                {'showRedBadge' in item && item.showRedBadge && redCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#E05252] text-white text-[9px] font-bold px-1 animate-pulse">
                    {redCount}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center justify-center h-12 border-t border-[#1A2035]">
          <span className="w-2 h-2 rounded-full bg-[#4BF2A2] animate-pulse" />
        </div>
      </aside>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around bg-[#0D1525] border-t border-[#1A2035] h-14 px-2">
        {NAV_ITEMS.slice(0, 5).map((item) => {
          const isActive = item.href === '/'
            ? pathname === '/'
            : pathname.startsWith(item.href)
          const Icon = item.icon

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-colors ${
                isActive ? 'text-[#F2784B]' : 'text-[#4B5A7A]'
              }`}
            >
              <Icon size={18} />
              <span className="text-[9px] mt-0.5">{item.label}</span>
              {item.showBadge && pendingCount > 0 && (
                <span className="absolute top-0.5 right-0.5 min-w-[14px] h-3.5 flex items-center justify-center rounded-full bg-[#F2784B] text-white text-[8px] font-bold px-0.5">
                  {pendingCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>
    </>
  )
}
