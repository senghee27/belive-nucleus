'use client'

import type { ClusterHealth } from '@/lib/types'

const DOT_COLORS: Record<string, string> = { red: '#E05252', amber: '#E8A838', green: '#4BF2A2' }

export function ClusterDotNav({ clusters, visibleClusters, onDotClick }: {
  clusters: ClusterHealth[]
  visibleClusters: string[]
  onDotClick: (cluster: string) => void
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-1.5">
      {clusters.map(c => {
        const isVisible = visibleClusters.includes(c.cluster)
        const color = DOT_COLORS[c.health_status] ?? '#4B5A7A'
        return (
          <button key={c.cluster} onClick={() => onDotClick(c.cluster)}
            className="flex flex-col items-center gap-0.5 transition-all">
            <span className={`rounded-full transition-all ${isVisible ? 'ring-1 ring-white/40' : ''}`}
              style={{
                width: isVisible ? 13 : 10,
                height: isVisible ? 13 : 10,
                backgroundColor: color,
                opacity: isVisible ? 1 : 0.5,
                boxShadow: isVisible ? `0 0 6px ${color}` : 'none',
              }} />
            <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A]">{c.cluster}</span>
          </button>
        )
      })}
    </div>
  )
}
