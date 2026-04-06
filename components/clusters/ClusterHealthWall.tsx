'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { RefreshCw } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { ClusterDotNav } from './ClusterDotNav'
import { ViewToggle } from './ViewToggle'
import { CardHeader } from './CardHeader'
import { CardFooter } from './CardFooter'
import { CategoryView } from './CategoryView'
import { CommandView } from './CommandView'
import { ClusterDetailPanel } from './ClusterDetailPanel'
import type { WallView } from './ViewToggle'
import type { ClusterHealth } from '@/lib/types'

const STATUS_BORDER: Record<string, string> = { red: '#E05252', amber: '#E8A838', green: '#1A2035' }
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

export function ClusterHealthWall({ initialClusters }: { initialClusters: ClusterHealth[] }) {
  const [clusters, setClusters] = useState<ClusterHealth[]>(initialClusters)
  const [view, setView] = useState<WallView>(() => {
    try { return (sessionStorage.getItem('nucleus_cluster_view') as WallView) ?? 'category' } catch { return 'category' }
  })
  const [visibleClusters, setVisibleClusters] = useState<string[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

  // Realtime
  useEffect(() => {
    const ch = supabase.channel('cluster-health')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cluster_health_cache' }, () => {
        fetch('/api/clusters').then(r => r.json()).then(d => { if (d.ok) setClusters(d.clusters) })
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])

  // Intersection observer for dot nav
  useEffect(() => {
    if (!scrollRef.current) return
    const observer = new IntersectionObserver(
      (entries) => {
        const updates: Record<string, boolean> = {}
        entries.forEach(entry => {
          const clusterId = entry.target.getAttribute('data-cluster')
          if (clusterId) updates[clusterId] = entry.isIntersecting
        })
        setVisibleClusters(prev => {
          const next = new Set(prev)
          for (const [id, visible] of Object.entries(updates)) {
            if (visible) next.add(id); else next.delete(id)
          }
          return [...next]
        })
      },
      { root: scrollRef.current, threshold: 0.3 }
    )

    cardRefs.current.forEach(ref => observer.observe(ref))
    return () => observer.disconnect()
  }, [clusters])

  const handleViewChange = useCallback((v: WallView) => {
    setView(v)
    try { sessionStorage.setItem('nucleus_cluster_view', v) } catch {}
  }, [])

  const scrollToCluster = useCallback((cluster: string) => {
    const card = cardRefs.current.get(cluster)
    if (card) card.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
  }, [])

  const handleScan = useCallback(async (cluster: string) => {
    try {
      await fetch(`/api/clusters/scan?cluster=${cluster}`, {
        method: 'POST', headers: { 'x-nucleus-secret': 'belive_nucleus_2026' },
      })
      toast.success(`${cluster} scanned`)
    } catch { toast.error('Scan failed') }
  }, [])

  const handleScanAll = useCallback(async () => {
    setScanning(true)
    try {
      await fetch('/api/clusters/scan', { method: 'POST', headers: { 'x-nucleus-secret': 'belive_nucleus_2026' } })
      const d = await fetch('/api/clusters').then(r => r.json())
      if (d.ok) setClusters(d.clusters)
      toast.success('All clusters scanned')
    } catch { toast.error('Scan failed') }
    finally { setScanning(false) }
  }, [])

  const handleMoreClick = useCallback((cluster: string, _category: string) => {
    setSelected(cluster)
  }, [])

  const redCount = clusters.filter(c => c.health_status === 'red').length
  const selectedCluster = clusters.find(c => c.cluster === selected)

  return (
    <div className="flex gap-4 h-[calc(100vh-80px)]">
      <div className={`${selected ? 'w-[55%]' : 'w-full'} flex flex-col min-w-0 transition-all`}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 mb-1">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[#E8EEF8]">Cluster Health</h2>
            {redCount > 0 && <span className="text-xs px-2 py-0.5 rounded-full bg-[#E05252]/15 text-[#E05252] animate-pulse">{redCount} critical</span>}
          </div>
          <div className="flex items-center gap-2">
            <ViewToggle view={view} onChange={handleViewChange} />
            <button onClick={handleScanAll} disabled={scanning}
              className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium border border-[#1A2035] text-[#4B5A7A] hover:text-[#F2784B] hover:border-[#F2784B]/40 transition-colors disabled:opacity-50">
              <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
              Scan All
            </button>
          </div>
        </div>

        {/* Dot nav */}
        <ClusterDotNav clusters={clusters} visibleClusters={visibleClusters} onDotClick={scrollToCluster} />

        {/* Card wall */}
        <div ref={scrollRef}
          className="flex gap-3 px-4 pb-4 overflow-x-auto overflow-y-hidden flex-1 cluster-wall"
          style={{ scrollSnapType: 'x proximity', scrollbarWidth: 'none', msOverflowStyle: 'none', WebkitOverflowScrolling: 'touch' }}>
          {clusters.map(c => (
            <div key={c.cluster}
              ref={el => { if (el) cardRefs.current.set(c.cluster, el) }}
              data-cluster={c.cluster}
              className="shrink-0"
              style={{ scrollSnapAlign: 'start', width: 'calc((100vw - 56px - 48px) / 4)', minWidth: 280, maxWidth: 400 }}>
              <div className="h-full bg-[#0D1525] border rounded-xl flex flex-col overflow-hidden transition-colors"
                style={{ borderColor: STATUS_BORDER[c.health_status] ?? '#1A2035', height: 'calc(100vh - 120px)' }}>
                <CardHeader cluster={c.cluster} clusterName={c.cluster_name} healthStatus={c.health_status} healthScore={c.health_score} />

                <div className="flex-1 overflow-hidden relative">
                  <AnimatePresence mode="wait">
                    {view === 'category' ? (
                      <motion.div key="category" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }} className="h-full">
                        <CategoryView data={c} onMoreClick={handleMoreClick} />
                      </motion.div>
                    ) : (
                      <motion.div key="command" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }} className="h-full">
                        <CommandView data={c} onMoreClick={handleMoreClick} />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <CardFooter lastComputedAt={c.last_computed_at} briefSentToday={c.brief_sent_today}
                  standupReportAt={c.standup_report_at} clusterId={c.cluster} onScan={handleScan} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Side panel */}
      {selected && selectedCluster && (
        <div className="w-[45%] shrink-0">
          <ClusterDetailPanel cluster={selectedCluster} color={CLUSTER_COLORS[selected] ?? '#4B5A7A'} onClose={() => setSelected(null)} />
        </div>
      )}

      {/* Hide scrollbar CSS */}
      <style jsx global>{`.cluster-wall::-webkit-scrollbar { display: none; }`}</style>
    </div>
  )
}
