'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ClusterColumn } from './ClusterColumn'
import { ClusterDetailPanel } from './ClusterDetailPanel'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import type { ClusterHealth } from '@/lib/types'

const CLUSTER_COLORS: Record<string, string> = {
  C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838',
  C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252',
}

export function ClusterHealthWall({ initialClusters }: { initialClusters: ClusterHealth[] }) {
  const [clusters, setClusters] = useState<ClusterHealth[]>(initialClusters)
  const [selected, setSelected] = useState<string | null>(null)
  const [computing, setComputing] = useState(false)

  useEffect(() => {
    const ch = supabase.channel('cluster-health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cluster_health_cache' }, () => {
        fetch('/api/clusters').then(r => r.json()).then(d => { if (d.ok) setClusters(d.clusters) })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  async function handleCompute() {
    setComputing(true)
    try {
      toast.info('Scanning all groups + AI Report...')
      await fetch('/api/lark/scan', { method: 'POST', headers: { 'x-nucleus-secret': 'belive_nucleus_2026' } })
      toast.info('Computing cluster health...')
      await fetch('/api/clusters/compute', { method: 'POST', headers: { 'x-nucleus-secret': 'belive_nucleus_2026' } })
      const d = await fetch('/api/clusters').then(r => r.json())
      if (d.ok) setClusters(d.clusters)
      toast.success('Scan & health computation complete')
    } catch { toast.error('Scan failed') }
    finally { setComputing(false) }
  }

  const redCount = clusters.filter(c => c.health_status === 'red').length
  const selectedCluster = clusters.find(c => c.cluster === selected)

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left — Columns */}
      <div className={`${selected ? 'w-[45%]' : 'w-full'} flex flex-col min-w-0 transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#E8EEF8]">Cluster Health</h2>
            {redCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[#E05252]/15 text-[#E05252] animate-pulse">{redCount} critical</span>}
          </div>
          <button onClick={handleCompute} disabled={computing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-xs font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={computing ? 'animate-spin' : ''} />
            {computing ? 'Scanning...' : 'Scan & Compute'}
          </button>
        </div>

        {/* Scrollable columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex gap-3 min-w-max h-full">
            {clusters.map(c => (
              <ClusterColumn key={c.cluster} cluster={c} color={CLUSTER_COLORS[c.cluster] ?? '#4B5A7A'}
                selected={selected === c.cluster} onClick={() => setSelected(selected === c.cluster ? null : c.cluster)} />
            ))}
          </div>
        </div>
      </div>

      {/* Right — Detail Panel */}
      {selected && selectedCluster && (
        <div className="w-[55%] shrink-0">
          <ClusterDetailPanel cluster={selectedCluster} color={CLUSTER_COLORS[selected] ?? '#4B5A7A'} onClose={() => setSelected(null)} />
        </div>
      )}
    </div>
  )
}
