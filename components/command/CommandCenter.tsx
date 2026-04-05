'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { IncidentCard } from './IncidentCard'
import { IncidentDetail } from './IncidentDetail'
import type { Incident, IncidentStats } from '@/lib/types'

const STATUS_COLORS: Record<string, string> = {
  new: '#E05252', analysed: '#9B6DFF', awaiting_lee: '#E8A838',
  acting: '#4BB8F2', resolved: '#4BF2A2', archived: '#4B5A7A',
}
const STATUS_LABELS: Record<string, string> = {
  new: 'New', awaiting_lee: 'Awaiting Lee', acting: 'Acting', resolved: 'Resolved',
}

export function CommandCenter({ initialIncidents, initialStats }: { initialIncidents: Incident[]; initialStats: IncidentStats }) {
  const [incidents, setIncidents] = useState<Incident[]>(initialIncidents)
  const [stats, setStats] = useState<IncidentStats>(initialStats)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel('incidents-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'incidents' }, () => {
        fetch('/api/incidents?status=new,analysed,awaiting_lee,acting&limit=50')
          .then(r => r.json())
          .then(d => { if (d.ok) { setIncidents(d.incidents); setStats(d.stats) } })
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleDecide = useCallback(async (id: string, action: string, instruction?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/incidents/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instruction }),
      })
      if (!res.ok) throw new Error()
      toast.success(action === 'approved' ? 'Approved & sent' : action === 'edited' ? 'Edited & sent' : 'Rejected')
      // Refresh
      const d = await fetch('/api/incidents?status=new,analysed,awaiting_lee,acting&limit=50').then(r => r.json())
      if (d.ok) { setIncidents(d.incidents); setStats(d.stats) }
      setSelectedId(null)
    } catch { toast.error('Action failed') }
    finally { setLoading(false) }
  }, [])

  const handleResolve = useCallback(async (id: string) => {
    setLoading(true)
    try {
      await fetch(`/api/incidents/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved', resolved_by: 'Lee' }),
      })
      toast.success('Resolved')
      const d = await fetch('/api/incidents?status=new,analysed,awaiting_lee,acting&limit=50').then(r => r.json())
      if (d.ok) { setIncidents(d.incidents); setStats(d.stats) }
      setSelectedId(null)
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }, [])

  const selected = incidents.find(i => i.id === selectedId) ?? null

  const grouped = {
    new: incidents.filter(i => i.status === 'new' || i.status === 'analysed'),
    awaiting_lee: incidents.filter(i => i.status === 'awaiting_lee'),
    acting: incidents.filter(i => i.status === 'acting'),
  }

  const statCards = [
    { label: 'New', count: (stats.by_status?.new ?? 0) + (stats.by_status?.analysed ?? 0), color: '#E05252' },
    { label: 'Awaiting Lee', count: stats.awaiting_lee, color: '#E8A838' },
    { label: 'Acting', count: stats.by_status?.acting ?? 0, color: '#4BB8F2' },
    { label: 'Resolved', count: stats.by_status?.resolved ?? 0, color: '#4BF2A2' },
  ]

  return (
    <div className="flex gap-4 h-[calc(100vh-120px)]">
      {/* Left: Feed */}
      <div className="flex-1 min-w-0 overflow-y-auto space-y-4 pr-2">
        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {statCards.map(s => (
            <div key={s.label} className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-3 text-center">
              <p className="text-xl font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: s.count > 0 ? s.color : '#4B5A7A' }}>{s.count}</p>
              <p className="text-[10px] text-[#4B5A7A]">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Sections */}
        {(['new', 'awaiting_lee', 'acting'] as const).map(section => {
          const items = grouped[section]
          if (items.length === 0) return null
          return (
            <div key={section}>
              <div className="flex items-center gap-2 mb-2">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[section] }} />
                <span className="text-xs font-medium" style={{ color: STATUS_COLORS[section] }}>{STATUS_LABELS[section]}</span>
                <span className="text-[10px] text-[#4B5A7A]">({items.length})</span>
              </div>
              <div className="space-y-2">
                {items.map(inc => (
                  <IncidentCard key={inc.id} incident={inc} selected={selectedId === inc.id} onClick={() => setSelectedId(inc.id)} />
                ))}
              </div>
            </div>
          )
        })}

        {incidents.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-sm text-[#4B5A7A]">No active incidents</p>
            <p className="text-xs text-[#2A3550] mt-1">All clear. Command center is quiet.</p>
          </div>
        )}
      </div>

      {/* Right: Detail */}
      <div className="hidden md:block w-[440px] shrink-0">
        {selected ? (
          <IncidentDetail incident={selected} onDecide={handleDecide} onResolve={handleResolve} loading={loading} />
        ) : (
          <div className="h-full flex items-center justify-center bg-[#0D1525] border border-[#1A2035] rounded-xl">
            <p className="text-xs text-[#2A3550]">Select an incident</p>
          </div>
        )}
      </div>
    </div>
  )
}
