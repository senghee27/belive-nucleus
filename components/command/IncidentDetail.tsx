'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { RefreshCw, CheckCircle, ArrowUp, Copy, Send, Archive } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Incident, IncidentTimeline } from '@/lib/types'

const SEV = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const CLUSTER = { C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838', C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252' }

type Props = { incident: Incident; onDecide: (id: string, action: string, instruction?: string) => Promise<void>; onResolve: (id: string) => Promise<void>; loading: boolean }

export function IncidentDetail({ incident, onDecide, onResolve, loading }: Props) {
  const [timeline, setTimeline] = useState<IncidentTimeline[]>([])
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summary, setSummary] = useState(incident.ai_summary)
  const [proposal, setProposal] = useState(incident.ai_proposal ?? '')
  const [isEditing, setIsEditing] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)

  useEffect(() => {
    setSummary(incident.ai_summary)
    setProposal(incident.ai_proposal ?? '')
    setIsEditing(false)
    fetch(`/api/incidents/${incident.id}/timeline`).then(r => r.json()).then(d => { if (d.ok) setTimeline(d.entries) })

    const ch = supabase.channel(`timeline-${incident.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'incident_timeline', filter: `incident_id=eq.${incident.id}` },
        (p) => setTimeline(prev => [...prev, p.new as IncidentTimeline]))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [incident.id, incident.ai_summary, incident.ai_proposal])

  async function handleSummary() {
    setSummaryLoading(true)
    try {
      const d = await fetch(`/api/incidents/${incident.id}/summary`, { method: 'POST' }).then(r => r.json())
      if (d.ok) { setSummary(d.summary); toast.success('Summary generated') }
    } catch { toast.error('Failed') }
    finally { setSummaryLoading(false) }
  }

  async function handleReply() {
    if (!replyText.trim()) return
    setReplySending(true)
    try {
      const d = await fetch(`/api/incidents/${incident.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyText }),
      }).then(r => r.json())
      if (d.ok) { toast.success(`Sent to ${incident.cluster}`); setReplyText('') }
    } catch { toast.error('Failed') }
    finally { setReplySending(false) }
  }

  const isAwaiting = incident.status === 'awaiting_lee'
  const edited = proposal !== (incident.ai_proposal ?? '')

  return (
    <div className="h-full bg-[#0D1525] border border-[#1A2035] rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1A2035]">
        <div className="flex items-center gap-1.5 mb-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full ${incident.severity === 'RED' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV[incident.severity as keyof typeof SEV] }} />
          {incident.cluster && <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: CLUSTER[incident.cluster as keyof typeof CLUSTER], backgroundColor: (CLUSTER[incident.cluster as keyof typeof CLUSTER] ?? '#8A9BB8') + '15' }}>{incident.cluster}</span>}
          <span className="text-[9px] text-[#4B5A7A]">{incident.priority} · {incident.agent.toUpperCase()}</span>
          <span className="text-[9px] text-[#2A3550] ml-auto">{formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}</span>
        </div>
        <h3 className="text-sm font-semibold text-[#E8EEF8]">{incident.title}</h3>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {/* Ticket Reference */}
        {(() => {
          const ext = incident as Record<string, unknown>
          const tid = String(ext.ticket_id ?? '')
          if (!tid) return null
          return (
            <div className="bg-[#080E1C] rounded-lg p-3 border border-[#1A2035]">
              <p className="text-[9px] text-[#E8A838] mb-1">Ticket Reference</p>
              <p className="text-xs text-[#E8EEF8] font-[family-name:var(--font-jetbrains-mono)]">{tid}</p>
              <div className="flex gap-4 mt-1 text-[10px] text-[#4B5A7A]">
                {ext.ticket_age_days ? <span>{String(ext.ticket_age_days)}d old</span> : null}
                {ext.sla_overdue ? <span className="text-[#E05252]">SLA OVERDUE</span> : null}
                {ext.ticket_owner_name ? <span>[{String(ext.ticket_owner_role)}] {String(ext.ticket_owner_name)}</span> : null}
              </div>
            </div>
          )
        })()}

        {/* AI Summary */}
        <div className="bg-[#080E1C] rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] text-[#9B6DFF]">AI Summary</span>
            <button onClick={handleSummary} disabled={summaryLoading} className="text-[#4B5A7A] hover:text-[#8A9BB8]">
              <RefreshCw size={11} className={summaryLoading ? 'animate-spin' : ''} />
            </button>
          </div>
          <p className="text-[11px] text-[#8A9BB8] leading-relaxed">{summary ?? 'Tap ↻ to generate'}</p>
        </div>

        {/* Thread */}
        <div>
          <p className="text-[9px] text-[#4B5A7A] uppercase tracking-wider mb-2">Thread</p>
          {timeline.length === 0 ? (
            <p className="text-[10px] text-[#2A3550] text-center py-4">No thread data</p>
          ) : (
            <div className="space-y-1.5">
              {timeline.map(e => (
                <div key={e.id} className={`rounded-lg px-3 py-2 ${
                  e.entry_type === 'lee_instruction' ? 'bg-[#F2784B]/5 border-l-2 border-[#F2784B]' :
                  e.entry_type === 'silence_gap' ? '' :
                  e.entry_type === 'escalation' ? 'bg-[#E8A838]/5 border-l-2 border-[#E8A838]' :
                  e.entry_type === 'resolution' ? 'bg-[#4BF2A2]/5 border-l-2 border-[#4BF2A2]' :
                  e.entry_type === 'ai_summary' ? 'bg-[#9B6DFF]/5 border-l-2 border-[#9B6DFF]' :
                  'bg-[#080E1C]'
                }`}>
                  {e.entry_type === 'silence_gap' ? (
                    <div className="flex items-center gap-2 text-[#E8A838]/60 py-1">
                      <span className="text-[9px]">⏸ {e.content}</span>
                      <span className="flex-1 border-t border-dashed border-[#E8A838]/20" />
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className={`text-[9px] font-medium ${e.is_lee ? 'text-[#F2784B]' : 'text-[#8A9BB8]'}`}>
                          {e.is_lee ? '⚡ Lee' : e.sender_name ?? 'System'}
                        </span>
                        <div className="flex items-center gap-1">
                          <span className="text-[8px] text-[#2A3550]">{formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}</span>
                          <button onClick={() => { navigator.clipboard.writeText(e.content); toast.success('Copied') }} className="text-[#2A3550] hover:text-[#4B5A7A]">
                            <Copy size={9} />
                          </button>
                        </div>
                      </div>
                      <p className="text-[10px] text-[#E8EEF8] leading-relaxed whitespace-pre-wrap">{e.content}</p>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Proposed Action */}
        {incident.ai_proposal && isAwaiting && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider">Proposed Action</span>
              {edited && <span className="text-[8px] text-[#E8A838] bg-[#E8A838]/10 px-1 rounded">Edited</span>}
            </div>
            <textarea value={proposal} onChange={e => { setProposal(e.target.value); setIsEditing(true) }}
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-2.5 text-[11px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 leading-relaxed" rows={5} />
          </div>
        )}

        {/* Reply as Lee */}
        <div>
          <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider">Send as Lee</span>
          <div className="mt-1">
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder={`Type instruction for ${incident.cluster ?? 'group'}...`}
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-2 text-[11px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 placeholder:text-[#2A3550]" rows={2} />
            <div className="flex justify-end mt-1">
              <button onClick={handleReply} disabled={replySending || !replyText.trim()}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-[10px] font-medium hover:bg-[#F2784B]/20 disabled:opacity-30">
                <Send size={10} /> {replySending ? '...' : `Send to ${incident.cluster ?? 'group'}`}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="p-3 border-t border-[#1A2035] flex gap-2">
        {isAwaiting && (
          <button onClick={() => onDecide(incident.id, edited ? 'edited' : 'approved', edited ? proposal : undefined)}
            disabled={loading}
            className="flex-1 h-8 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-[10px] font-medium hover:bg-[#4BF2A2]/20 disabled:opacity-50 flex items-center justify-center gap-1">
            <CheckCircle size={12} /> {edited ? 'Edit & Send' : 'Approve & Send'}
          </button>
        )}
        <button onClick={() => onResolve(incident.id)} disabled={loading}
          className="flex-1 h-8 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-[10px] font-medium hover:bg-[#4BF2A2]/20 disabled:opacity-50 flex items-center justify-center gap-1">
          <CheckCircle size={12} /> Resolve
        </button>
        <button onClick={() => { fetch(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ severity: incident.severity === 'GREEN' ? 'YELLOW' : 'RED' }) }); toast.success('Escalated') }}
          className="h-8 px-3 rounded-lg bg-[#E8A838]/10 text-[#E8A838] text-[10px] hover:bg-[#E8A838]/20 flex items-center gap-1">
          <ArrowUp size={12} />
        </button>
        {isAwaiting && (
          <button onClick={() => onDecide(incident.id, 'rejected')} disabled={loading}
            className="h-8 px-3 rounded-lg text-[#E05252]/50 text-[10px] hover:text-[#E05252] hover:bg-[#E05252]/10 flex items-center gap-1">
            <Archive size={12} />
          </button>
        )}
      </div>
    </div>
  )
}
