'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { ClusterColumn } from './ClusterColumn'
import { ClusterDetailPanel } from './ClusterDetailPanel'
import { RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ClusterHealth } from '@/lib/types'
import type { ClusterScanState } from './ClusterColumn'

const CLUSTER_COLORS: Record<string, string> = {
  C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838',
  C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252',
}

const CLUSTER_NAMES: Record<string, string> = {
  C1: 'Cheras', C2: 'Puchong', C3: 'OUG', C4: 'PJ', C5: 'Ara Damansara',
  C6: 'Setapak', C7: 'Wangsa Maju', C8: 'Penang', C9: 'JB', C10: 'Mont Kiara', C11: 'Bangsar',
}

const ALL_CLUSTERS = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']

export function ClusterHealthWall({ initialClusters }: { initialClusters: ClusterHealth[] }) {
  const [clusters, setClusters] = useState<ClusterHealth[]>(initialClusters)
  const [selected, setSelected] = useState<string | null>(null)
  const [clusterScanStates, setClusterScanStates] = useState<Record<string, ClusterScanState>>({})

  // Full scan state
  const [fullScanActive, setFullScanActive] = useState(false)
  const [scanningCluster, setScanningCluster] = useState<string | null>(null)
  const [completedClusters, setCompletedClusters] = useState<string[]>([])
  const cancelRef = useRef(false)

  useEffect(() => {
    const ch = supabase.channel('cluster-health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cluster_health_cache' }, () => {
        fetch('/api/clusters').then(r => r.json()).then(d => { if (d.ok) setClusters(d.clusters) })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  const refreshClusters = useCallback(async () => {
    const d = await fetch('/api/clusters').then(r => r.json())
    if (d.ok) setClusters(d.clusters)
  }, [])

  // Single cluster scan
  const handleScanCluster = useCallback(async (cluster: string) => {
    setClusterScanStates(prev => ({ ...prev, [cluster]: 'scanning' }))
    try {
      const res = await fetch(`/api/clusters/scan?cluster=${cluster}`, {
        method: 'POST',
        headers: { 'x-nucleus-secret': 'belive_nucleus_2026' },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      setClusterScanStates(prev => ({ ...prev, [cluster]: 'done' }))
      await refreshClusters()
      toast.success(`${cluster} scanned — ${data.total_messages ?? 0} msgs, ${data.total_incidents ?? 0} issues`)

      // Reset to idle after 3s
      setTimeout(() => setClusterScanStates(prev => ({ ...prev, [cluster]: 'idle' })), 3000)
    } catch (error) {
      setClusterScanStates(prev => ({ ...prev, [cluster]: 'error' }))
      toast.error(`${cluster} scan failed: ${error instanceof Error ? error.message : 'Unknown'}`)
      setTimeout(() => setClusterScanStates(prev => ({ ...prev, [cluster]: 'idle' })), 3000)
    }
  }, [refreshClusters])

  // Full scan — cluster by cluster sequentially
  const handleFullScan = useCallback(async () => {
    cancelRef.current = false
    setFullScanActive(true)
    setCompletedClusters([])
    setScanningCluster(null)

    // Reset all states
    const resetStates: Record<string, ClusterScanState> = {}
    ALL_CLUSTERS.forEach(c => { resetStates[c] = 'idle' })
    setClusterScanStates(resetStates)

    for (const cluster of ALL_CLUSTERS) {
      if (cancelRef.current) break

      setScanningCluster(cluster)
      setClusterScanStates(prev => ({ ...prev, [cluster]: 'scanning' }))

      try {
        const res = await fetch(`/api/clusters/scan?cluster=${cluster}`, {
          method: 'POST',
          headers: { 'x-nucleus-secret': 'belive_nucleus_2026' },
        })
        if (!res.ok) throw new Error('Failed')

        setClusterScanStates(prev => ({ ...prev, [cluster]: 'done' }))
        setCompletedClusters(prev => [...prev, cluster])
      } catch {
        setClusterScanStates(prev => ({ ...prev, [cluster]: 'error' }))
        setCompletedClusters(prev => [...prev, cluster])
      }
    }

    setScanningCluster(null)
    setFullScanActive(false)
    await refreshClusters()

    if (cancelRef.current) {
      toast.info('Scan cancelled')
    } else {
      toast.success('Full scan & compute complete')
    }
  }, [refreshClusters])

  const handleCancelScan = useCallback(() => {
    cancelRef.current = true
  }, [])

  const totalToScan = ALL_CLUSTERS.length
  const doneCount = completedClusters.length
  const pct = fullScanActive ? Math.round((doneCount / totalToScan) * 100) : 0

  const redCount = clusters.filter(c => c.health_status === 'red').length
  const selectedCluster = clusters.find(c => c.cluster === selected)

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left — Columns */}
      <div className={`${selected ? 'w-[45%]' : 'w-full'} flex flex-col min-w-0 transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#E8EEF8]">Cluster Health</h2>
            {redCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[#E05252]/15 text-[#E05252] animate-pulse">{redCount} critical</span>}
          </div>
          <button onClick={handleFullScan} disabled={fullScanActive}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-xs font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50">
            <RefreshCw size={12} className={fullScanActive ? 'animate-spin' : ''} />
            {fullScanActive ? 'Scanning...' : 'Scan & Compute'}
          </button>
        </div>

        {/* Progress bar — visible during full scan */}
        {fullScanActive && (
          <div className="mb-3 bg-[#111D30] rounded-lg p-2.5 border border-[#1A2035]">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-[#8A9BB8] font-medium">
                Scanning clusters... <span className="text-[#4BB8F2]">{scanningCluster}</span>
                {scanningCluster && CLUSTER_NAMES[scanningCluster] ? ` — ${CLUSTER_NAMES[scanningCluster]}` : ''}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">
                  {doneCount}/{totalToScan} {pct}%
                </span>
                <button onClick={handleCancelScan}
                  className="text-[#4B5A7A] hover:text-[#E05252] transition-colors" title="Cancel">
                  <X size={12} />
                </button>
              </div>
            </div>
            <div className="w-full h-1.5 bg-[#0D1525] rounded-full overflow-hidden">
              <div className="h-full bg-[#4BB8F2] rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {/* Scrollable columns */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex gap-3 min-w-max h-full">
            {clusters.map(c => (
              <ClusterColumn key={c.cluster} cluster={c} color={CLUSTER_COLORS[c.cluster] ?? '#4B5A7A'}
                selected={selected === c.cluster} onClick={() => setSelected(selected === c.cluster ? null : c.cluster)}
                scanState={clusterScanStates[c.cluster] ?? 'idle'}
                onScan={fullScanActive ? undefined : handleScanCluster} />
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
