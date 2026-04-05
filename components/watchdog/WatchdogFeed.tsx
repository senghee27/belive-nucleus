'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

type LogEvent = {
  id: string; created_at: string; event_type: string; event_subtype: string | null
  cluster: string | null; group_name: string | null; summary: string
  detail: Record<string, unknown> | null; incident_id: string | null
  success: boolean; error_message: string | null
}

type Stats = { total: number; by_type: Record<string, number>; errors_today: number }

const EVENT_STYLES: Record<string, { icon: string; border: string; label: string }> = {
  MESSAGE_RECEIVED: { icon: '📨', border: '#4B5A7A', label: 'MESSAGE' },
  AI_CLASSIFIED: { icon: '🧠', border: '#9B6DFF', label: 'AI CLASSIFIED' },
  INCIDENT_CREATED: { icon: '⚡', border: '#F2784B', label: 'INCIDENT' },
  LEE_ACTION: { icon: '👤', border: '#4BF2A2', label: 'LEE ACTION' },
  SYSTEM_SENT: { icon: '📤', border: '#4BB8F2', label: 'SENT' },
  SCHEDULED_JOB: { icon: '⏰', border: '#E8A838', label: 'JOB' },
  ERROR: { icon: '⚠️', border: '#E05252', label: 'ERROR' },
}

const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

export function WatchdogFeed() {
  const [events, setEvents] = useState<LogEvent[]>([])
  const [stats, setStats] = useState<Stats | null>(null)
  const [typeFilter, setTypeFilter] = useState<string | null>(null)
  const [clusterFilter, setClusterFilter] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [lastEventTime, setLastEventTime] = useState<Date>(new Date())
  const [, setTick] = useState(0)
  const feedRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadEvents()
    const timer = setInterval(() => setTick(t => t + 1), 5000)

    const ch = supabase.channel('watchdog-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nucleus_activity_log' }, (payload) => {
        const newEvent = payload.new as LogEvent
        setEvents(prev => [newEvent, ...prev.slice(0, 499)])
        setLastEventTime(new Date(newEvent.created_at))
        if (newEvent.event_type === 'ERROR') {
          // Could show a toast here
        }
      })
      .subscribe()

    return () => { clearInterval(timer); supabase.removeChannel(ch) }
  }, [])

  useEffect(() => { loadEvents() }, [typeFilter, clusterFilter])

  async function loadEvents() {
    const params = new URLSearchParams({ limit: '200' })
    if (typeFilter) params.set('event_type', typeFilter)
    if (clusterFilter) params.set('cluster', clusterFilter)
    const d = await fetch(`/api/watchdog?${params}`).then(r => r.json())
    if (d.ok) { setEvents(d.events); setStats(d.stats) }
  }

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const secondsSinceLastEvent = Math.round((Date.now() - lastEventTime.getTime()) / 1000)
  const liveStatus = secondsSinceLastEvent < 300 ? 'listening' : secondsSinceLastEvent < 600 ? 'quiet' : 'disconnected'

  const filters = [
    { key: null, label: 'All' },
    { key: 'MESSAGE_RECEIVED', label: '📨 Messages' },
    { key: 'AI_CLASSIFIED', label: '🧠 AI' },
    { key: 'INCIDENT_CREATED', label: '⚡ Incidents' },
    { key: 'LEE_ACTION', label: '👤 Lee' },
    { key: 'SYSTEM_SENT', label: '📤 Sent' },
    { key: 'SCHEDULED_JOB', label: '⏰ Jobs' },
    { key: 'ERROR', label: '⚠️ Errors' },
  ]

  return (
    <div className="space-y-3">
      {/* Header */}
      <div>
        <h2 className="text-lg font-semibold text-[#E8EEF8]">Watchdog</h2>
        <p className="text-[10px] text-[#4B5A7A]">Everything Nucleus sees, does, and decides.</p>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: 'Processed', value: stats.total, color: '#E8EEF8' },
            { label: 'Incidents', value: stats.by_type?.INCIDENT_CREATED ?? 0, color: '#F2784B' },
            { label: 'Lee actions', value: stats.by_type?.LEE_ACTION ?? 0, color: '#4BF2A2' },
            { label: 'Errors', value: stats.errors_today, color: stats.errors_today > 0 ? '#E05252' : '#4B5A7A' },
          ].map(s => (
            <div key={s.label} className="bg-[#0D1525] border border-[#1A2035] rounded-lg p-3 text-center">
              <p className="text-lg font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: s.color }}>{s.value}</p>
              <p className="text-[9px] text-[#4B5A7A]">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap gap-1.5">
        {filters.map(f => (
          <button key={f.key ?? 'all'} onClick={() => setTypeFilter(f.key)}
            className={`px-2 py-0.5 rounded text-[10px] transition-colors ${typeFilter === f.key ? 'bg-[#F2784B]/15 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
            {f.label}
          </button>
        ))}
        <span className="w-px h-5 bg-[#1A2035] self-center mx-1" />
        {['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11'].map(c => (
          <button key={c} onClick={() => setClusterFilter(clusterFilter === c ? null : c)}
            className={`px-1.5 py-0.5 rounded text-[9px] font-[family-name:var(--font-jetbrains-mono)] font-bold ${clusterFilter === c ? '' : 'text-[#4B5A7A]'}`}
            style={clusterFilter === c ? { color: CLUSTER_COLORS[c], backgroundColor: CLUSTER_COLORS[c] + '20' } : {}}>
            {c}
          </button>
        ))}
      </div>

      {/* Live indicator */}
      <div className="flex items-center gap-2">
        <span className={`w-2 h-2 rounded-full ${liveStatus === 'listening' ? 'bg-[#4BF2A2] animate-pulse' : liveStatus === 'quiet' ? 'bg-[#E8A838]' : 'bg-[#E05252]'}`} />
        <span className="text-[10px] text-[#4B5A7A]">
          {liveStatus === 'listening' ? `Listening — last event ${secondsSinceLastEvent}s ago` :
           liveStatus === 'quiet' ? `Quiet — ${Math.round(secondsSinceLastEvent / 60)}m since last event` :
           'Disconnected — reconnecting...'}
        </span>
      </div>

      {/* Event feed */}
      <div ref={feedRef} className="space-y-1">
        {events.length === 0 ? (
          <p className="text-center py-16 text-xs text-[#4B5A7A]">No events yet</p>
        ) : events.map(event => {
          const style = EVENT_STYLES[event.event_type] ?? EVENT_STYLES.ERROR
          const isExpanded = expanded.has(event.id) || event.event_type === 'ERROR'
          const time = new Date(event.created_at)
          const timeStr = time.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

          return (
            <div key={event.id}
              className={`bg-[#0D1525] border border-[#1A2035] rounded-lg overflow-hidden cursor-pointer transition-colors hover:bg-[#111D30] ${event.event_type === 'ERROR' ? 'bg-[rgba(224,82,82,0.05)]' : ''}`}
              style={{ borderLeftWidth: '2px', borderLeftColor: style.border }}
              onClick={() => toggleExpand(event.id)}>

              {/* Collapsed row */}
              <div className="px-3 py-2 flex items-start gap-2">
                <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A] shrink-0 mt-0.5">{timeStr}</span>
                <span className="text-sm shrink-0">{style.icon}</span>
                <span className="text-[11px] text-[#E8EEF8] flex-1 leading-snug">{event.summary}</span>
                {event.cluster && event.cluster !== 'ALL' && (
                  <span className="text-[9px] px-1 py-0.5 rounded shrink-0" style={{ color: CLUSTER_COLORS[event.cluster] ?? '#4B5A7A', backgroundColor: (CLUSTER_COLORS[event.cluster] ?? '#4B5A7A') + '15' }}>{event.cluster}</span>
                )}
                {event.incident_id && (
                  <Link href={`/command/${event.incident_id}`} onClick={e => e.stopPropagation()}
                    className="text-[9px] text-[#F2784B] hover:underline shrink-0">View →</Link>
                )}
              </div>

              {/* Expanded detail */}
              {isExpanded && event.detail && (
                <div className="px-3 pb-3 border-t border-[#1A2035]/50">
                  <pre className="text-[9px] text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)] whitespace-pre-wrap mt-2 leading-relaxed">
                    {JSON.stringify(event.detail, null, 2)}
                  </pre>
                  {event.error_message && (
                    <p className="text-[10px] text-[#E05252] mt-2">Error: {event.error_message}</p>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
