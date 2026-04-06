'use client'

import { useState, useEffect } from 'react'
import { Bell } from 'lucide-react'

function LiveTime() {
  const [time, setTime] = useState('')
  useEffect(() => {
    const update = () => setTime(new Date().toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' }))
    update()
    const t = setInterval(update, 30000)
    return () => clearInterval(t)
  }, [])
  return <span className="text-[13px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{time}</span>
}

export function MobileStatusBar() {
  return (
    <div className="h-[52px] px-5 flex items-center justify-between border-b border-[#1A2035] shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-[#4BF2A2] animate-pulse shadow-[0_0_8px_#4BF2A2]" />
        <span className="text-[13px] font-semibold text-[#E8EEF8] font-[family-name:var(--font-jetbrains-mono)] tracking-wider">NUCLEUS</span>
      </div>
      <div className="flex items-center gap-4">
        <LiveTime />
        <Bell size={16} className="text-[#4B5A7A]" />
      </div>
    </div>
  )
}
