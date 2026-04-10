'use client'

import { useRouter } from 'next/navigation'

export type LogEntry = {
  id: string
  incident_id: string
  title: string
  cluster: string | null
  category: string
  version_number: number
  outcome: string
  decided_at: string
  feedback_tags: string[]
}

export function RevisionLog({ log, filter, onFilterChange }: {
  log: LogEntry[]
  filter: 'all' | 'edited' | 'discarded'
  onFilterChange: (f: 'all' | 'edited' | 'discarded') => void
}) {
  const router = useRouter()

  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold">Revision Log</h3>
        <div className="flex gap-1">
          {(['all', 'edited', 'discarded'] as const).map(f => (
            <button key={f} onClick={() => onFilterChange(f)}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                filter === f ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'
              }`}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>
      {log.length === 0 ? (
        <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No entries yet</p>
      ) : (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {log.map(entry => {
            const outcomeColor = entry.outcome === 'discarded' ? '#E05252' : entry.outcome === 'edited' ? '#E8A838' : '#4BF2A2'
            const outcomeLabel = entry.outcome === 'discarded' ? 'Discarded' : entry.outcome === 'edited' ? `Sent v${entry.version_number}` : `Sent v1`
            return (
              <button key={entry.id} onClick={() => router.push(`/command/${entry.incident_id}`)}
                className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-[#111D30] text-left text-[11px]">
                <span className="text-[#E8EEF8] truncate flex-1">{entry.title}</span>
                {entry.cluster && <span className="text-[9px] text-[#8A9BB8]">{entry.cluster}</span>}
                <span className="text-[9px] text-[#4B5A7A] w-20 truncate">{entry.category}</span>
                <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: outcomeColor, backgroundColor: `${outcomeColor}15` }}>
                  {outcomeLabel}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
