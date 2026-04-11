'use client'

import type { WarRoomMode } from '@/app/api/clusters/war-room/route'

/**
 * ModeToggle — segmented control for [Tickets] [Command].
 *
 * Spec §2: top-left of the war-room. Toggling preserves scroll
 * position and selected cluster — the parent component handles
 * that state, this component just fires the onChange callback.
 */

interface ModeToggleProps {
  mode: WarRoomMode
  onChange: (next: WarRoomMode) => void
}

const SEGMENTS: Array<{ key: WarRoomMode; label: string; hint: string }> = [
  { key: 'tickets', label: 'Tickets', hint: 'Operational pipeline — open tickets from the ops system' },
  { key: 'command', label: 'Command', hint: 'Triage stream — incidents requiring Lee\'s attention' },
]

export function ModeToggle({ mode, onChange }: ModeToggleProps) {
  return (
    <div
      role="tablist"
      aria-label="War-room data source"
      className="inline-flex items-center rounded-md border border-[#1A2035] bg-[#080E1C] p-0.5"
    >
      {SEGMENTS.map(seg => {
        const active = mode === seg.key
        return (
          <button
            key={seg.key}
            role="tab"
            type="button"
            aria-selected={active}
            title={seg.hint}
            onClick={() => onChange(seg.key)}
            className={`px-3 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors ${
              active
                ? 'bg-[#F2784B] text-white shadow-sm'
                : 'text-[#8A9BB8] hover:text-[#E8EEF8]'
            }`}
          >
            {seg.label}
          </button>
        )
      })}
    </div>
  )
}
