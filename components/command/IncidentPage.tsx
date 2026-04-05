'use client'

import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink, ArrowUp, CheckCircle, Archive } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { IncidentDetail } from './IncidentDetail'
import type { Incident, IncidentTimeline } from '@/lib/types'
import { ISSUE_CATEGORIES } from '@/lib/types'

const SEV = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const CLUSTER_C: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }
const STATUS_STYLES: Record<string, { color: string; label: string }> = {
  new: { color: '#E05252', label: 'NEW' }, awaiting_lee: { color: '#E8A838', label: 'AWAITING LEE' },
  acting: { color: '#4BB8F2', label: 'ACTING' }, resolved: { color: '#4BF2A2', label: 'RESOLVED' },
  archived: { color: '#4B5A7A', label: 'ARCHIVED' },
}

export function IncidentPage({ incident: initial, timeline: initialTimeline }: { incident: Incident; timeline: IncidentTimeline[] }) {
  const router = useRouter()
  const [incident, setIncident] = useState<Incident>(initial)
  const [loading, setLoading] = useState(false)

  const cat = ISSUE_CATEGORIES[(incident as Record<string, unknown>).category as string ?? 'other'] ?? ISSUE_CATEGORIES.other
  const status = STATUS_STYLES[incident.status] ?? STATUS_STYLES.new
  const larkDeepLink = (incident as Record<string, unknown>).source_lark_message_id
    ? `https://applink.larksuite.com/client/message/open?messageId=${(incident as Record<string, unknown>).source_lark_message_id}`
    : null

  const handleDecide = useCallback(async (id: string, action: string, instruction?: string) => {
    setLoading(true)
    try {
      await fetch(`/api/incidents/${id}/decide`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, instruction }),
      })
      toast.success(action === 'approved' ? 'Approved & sent' : action === 'rejected' ? 'Rejected' : 'Sent')
      const d = await fetch(`/api/incidents/${id}`).then(r => r.json())
      if (d.ok) setIncident(d.incident)
    } catch { toast.error('Failed') }
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
      router.push('/command')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }, [router])

  return (
    <div className="space-y-4">
      {/* Back + Header */}
      <div className="flex items-center gap-3">
        <Link href="/command" className="text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <span className="text-xs text-[#4B5A7A]">Back to Command</span>
      </div>

      {/* Incident header */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-2">
          <span className={`w-3 h-3 rounded-full ${incident.severity === 'RED' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV[incident.severity as keyof typeof SEV] }} />
          {incident.cluster && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ color: CLUSTER_C[incident.cluster], backgroundColor: (CLUSTER_C[incident.cluster] ?? '#8A9BB8') + '15' }}>{incident.cluster}</span>}
          <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ color: incident.priority === 'P1' ? '#E05252' : incident.priority === 'P2' ? '#E8A838' : '#4B5A7A', backgroundColor: (incident.priority === 'P1' ? '#E05252' : '#E8A838') + '15' }}>{incident.priority}</span>
          <span className="text-[10px] text-[#4B5A7A]">{incident.agent.toUpperCase()}</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ color: status.color, backgroundColor: status.color + '15' }}>{status.label}</span>
          <span className="text-sm" title={cat.label}>{cat.icon}</span>
          {Boolean((incident as Record<string, unknown>).sla_overdue) && <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#E05252]/15 text-[#E05252]">SLA OVERDUE</span>}
        </div>

        <h1 className="text-base font-semibold text-[#E8EEF8] mb-2">{incident.title}</h1>

        <div className="flex flex-wrap gap-4 text-[10px] text-[#4B5A7A] mb-3">
          <span>🕐 Detected: {new Date(incident.created_at).toLocaleString('en-MY')} ({formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })})</span>
          <span>🔄 Updated: {new Date(incident.updated_at).toLocaleString('en-MY')} ({formatDistanceToNow(new Date(incident.updated_at), { addSuffix: true })})</span>
          {incident.cluster && <span>📍 {incident.group_name ?? incident.cluster}</span>}
        </div>

        {/* Ticket reference */}
        {Boolean((incident as Record<string, unknown>).ticket_id) && (
          <div className="text-[10px] text-[#E8A838] mb-3">
            🎫 {String((incident as Record<string, unknown>).ticket_id)} · {String((incident as Record<string, unknown>).ticket_age_days ?? '')}d · [{String((incident as Record<string, unknown>).ticket_owner_role ?? '')}] {String((incident as Record<string, unknown>).ticket_owner_name ?? '')}
          </div>
        )}

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          {larkDeepLink && (
            <a href={larkDeepLink} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#111D30] text-[10px] text-[#8A9BB8] hover:text-[#E8EEF8] transition-colors">
              <ExternalLink size={11} /> View in Lark
            </a>
          )}
          <button onClick={() => { fetch(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ severity: incident.severity === 'GREEN' ? 'YELLOW' : 'RED' }) }); toast.success('Escalated') }}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8A838]/10 text-[10px] text-[#E8A838] hover:bg-[#E8A838]/20">
            <ArrowUp size={11} /> Escalate
          </button>
          <button onClick={() => handleResolve(incident.id)} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#4BF2A2]/10 text-[10px] text-[#4BF2A2] hover:bg-[#4BF2A2]/20 disabled:opacity-50">
            <CheckCircle size={11} /> Resolve
          </button>
          <button onClick={() => handleDecide(incident.id, 'rejected')} disabled={loading}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] text-[#4B5A7A] hover:text-[#E05252] hover:bg-[#E05252]/10">
            <Archive size={11} /> Archive
          </button>
        </div>
      </div>

      {/* 60/40 Split: Thread + Intelligence */}
      <IncidentDetail incident={incident} onDecide={handleDecide} onResolve={handleResolve} loading={loading} />
    </div>
  )
}
