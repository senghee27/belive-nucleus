'use client'

import { usePathname } from 'next/navigation'

const PAGE_TITLES: Record<string, string> = {
  '/overview': 'Overview',
  '/command': 'Command Center',
  '/ceo': 'CEO Agent',
  '/cfo': 'CFO Agent',
  '/coo': 'COO Agent',
  '/cto': 'CTO Agent',
  '/groups': 'Groups',
  '/schedules': 'Scan Schedules',
  '/memory': 'Agent Memory',
  '/settings': 'Settings',
}

export function Header() {
  const pathname = usePathname()
  const title = PAGE_TITLES[pathname] ?? 'BeLive Nucleus'

  return (
    <header className="flex items-center justify-between h-13 px-6 border-b border-[#1A2035] bg-[#0D1525]/50 backdrop-blur-sm">
      <h1 className="text-sm font-medium text-[#E8EEF8]">{title}</h1>
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-[#4BF2A2] animate-pulse" />
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#4B5A7A] tracking-widest uppercase">
            Live
          </span>
        </div>
        <span className="text-xs text-[#8A9BB8]">Lee Seng Hee</span>
      </div>
    </header>
  )
}
