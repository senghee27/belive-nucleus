'use client'

import { LayoutList, Crosshair } from 'lucide-react'

export type WallView = 'category' | 'command'

export function ViewToggle({ view, onChange }: { view: WallView; onChange: (v: WallView) => void }) {
  return (
    <div className="flex gap-1">
      <button onClick={() => onChange('category')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
          view === 'category'
            ? 'bg-[#F2784B]/15 border-[#F2784B]/40 text-[#F2784B]'
            : 'bg-transparent border-[#1A2035] text-[#4B5A7A] hover:text-[#E8EEF8]'
        }`}>
        <LayoutList size={14} /> Category
      </button>
      <button onClick={() => onChange('command')}
        className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border transition-colors ${
          view === 'command'
            ? 'bg-[#F2784B]/15 border-[#F2784B]/40 text-[#F2784B]'
            : 'bg-transparent border-[#1A2035] text-[#4B5A7A] hover:text-[#E8EEF8]'
        }`}>
        <Crosshair size={14} /> Command
      </button>
    </div>
  )
}
