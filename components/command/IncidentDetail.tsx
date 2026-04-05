'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { RefreshCw, Copy, CheckCircle, ArrowUp, Archive, Send, X, ChevronDown, ChevronUp } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import type { Incident, IncidentTimeline } from '@/lib/types'

const SEV = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const CLUSTER_C: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }
const DOT_COLORS: Record<string, string> = { message:'#4B5A7A', lee_instruction:'#F2784B', ai_summary:'#9B6DFF', escalation:'#E05252', resolution:'#4BF2A2', silence_gap:'transparent', system_note:'#4B5A7A' }
const BORDER_COLORS: Record<string, string> = { lee_instruction:'#F2784B', ai_summary:'#9B6DFF', escalation:'#E05252', resolution:'#4BF2A2' }

type StaffMap = Record<string, { name: string; first_name: string; role: string | null; avatar_url: string | null }>

type Props = { incident: Incident; onDecide: (id: string, action: string, instruction?: string) => Promise<void>; onResolve: (id: string) => Promise<void>; loading: boolean }

export function IncidentDetail({ incident, onDecide, onResolve, loading }: Props) {
  const [timeline, setTimeline] = useState<IncidentTimeline[]>([])
  const [staff, setStaff] = useState<StaffMap>({})
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summary, setSummary] = useState(incident.ai_summary)
  const [summaryOpen, setSummaryOpen] = useState(true)
  const [proposal, setProposal] = useState(incident.ai_proposal ?? '')
  const [editing, setEditing] = useState(false)
  const [replyText, setReplyText] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    setSummary(incident.ai_summary); setProposal(incident.ai_proposal ?? ''); setEditing(false); setSent(false)
    fetch(`/api/incidents/${incident.id}/timeline`).then(r => r.json()).then(d => { if (d.ok) setTimeline(d.entries) })
    fetch('/api/staff').then(r => r.json()).then(d => {
      if (d.ok) {
        const map: StaffMap = {}
        for (const s of d.staff) map[s.open_id] = s
        setStaff(map)
      }
    })

    const ch = supabase.channel(`detail-${incident.id}`)
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

  async function handleSend(useProposed: boolean) {
    setSending(true)
    try {
      const body = useProposed ? { use_proposed: true } : { content: replyText }
      const d = await fetch(`/api/incidents/${incident.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(r => r.json())
      if (d.ok) {
        toast.success(d.thread_reply ? '✓ Sent in thread' : '✓ Sent to group')
        setSent(true); setReplyText('')
        if (useProposed) onDecide(incident.id, 'approved')
      } else { toast.error(d.error ?? 'Failed') }
    } catch { toast.error('Failed to send') }
    finally { setSending(false) }
  }

  function resolveName(openId: string | null): { name: string; role: string | null } {
    if (!openId) return { name: 'Unknown', role: null }
    const s = staff[openId]
    if (s) return { name: s.first_name || s.name, role: s.role }
    return { name: openId.slice(0, 12) + '...', role: null }
  }

  function resolveContent(content: string): string {
    return content.replace(/@_user_\d+/g, '@team').replace(/<at user_id="([^"]+)">([^<]*)<\/at>/g, (_, id) => {
      const s = staff[id]
      return `@${s?.first_name ?? s?.name ?? 'user'}`
    })
  }

  const isAwaiting = incident.status === 'awaiting_lee'
  const edited = proposal !== (incident.ai_proposal ?? '')

  return (
    <div className="h-full bg-[#0D1525] border border-[#1A2035] rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-3 border-b border-[#1A2035] flex items-center gap-2 flex-wrap">
        <span className={`w-2.5 h-2.5 rounded-full ${incident.severity === 'RED' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV[incident.severity as keyof typeof SEV] }} />
        {incident.cluster && <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: CLUSTER_C[incident.cluster], backgroundColor: (CLUSTER_C[incident.cluster] ?? '#8A9BB8') + '15' }}>{incident.cluster}</span>}
        <span className="text-[9px] text-[#4B5A7A]">{incident.priority} · {incident.agent.toUpperCase()}</span>
        <span className="text-xs text-[#E8EEF8] ml-2 truncate flex-1">{incident.title}</span>
        <span className="text-[9px] text-[#2A3550]">{formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}</span>
      </div>

      {/* 60/40 Split */}
      <div className="flex-1 flex min-h-0">
        {/* THREAD COLUMN 60% */}
        <div className="w-[60%] overflow-y-auto border-r border-[#1A2035]">
          <div className="p-3">
            <p className="text-[9px] text-[#4B5A7A] uppercase tracking-wider mb-3">Thread · {timeline.length} messages</p>
            <div className="relative pl-5">
              {/* Vertical line */}
              <div className="absolute left-[7px] top-0 bottom-0 w-px bg-[#1A2035]" />

              {timeline.map((entry) => {
                const isLee = entry.is_lee || entry.entry_type === 'lee_instruction'
                const dotColor = DOT_COLORS[entry.entry_type] ?? '#4B5A7A'
                const borderColor = BORDER_COLORS[entry.entry_type]
                const { name, role } = isLee ? { name: 'Lee Seng Hee', role: 'CEO' } : resolveName(entry.sender_open_id)
                const time = new Date(entry.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

                if (entry.entry_type === 'silence_gap') {
                  const hours = ((entry.metadata as Record<string, number> | null)?.gap_hours ?? 0)
                  return (
                    <div key={entry.id} className="flex items-center gap-2 py-2 pl-3 text-[10px]" style={{ color: hours > 3 ? '#E05252' : hours > 1 ? '#E8A838' : '#4B5A7A' }}>
                      ⏸ {entry.content}
                    </div>
                  )
                }

                return (
                  <div key={entry.id} className="relative mb-3">
                    {/* Dot */}
                    <div className="absolute -left-5 top-2 w-2 h-2 rounded-full z-10" style={{ backgroundColor: dotColor, boxShadow: isLee ? '0 0 6px rgba(242,120,75,0.5)' : 'none' }} />

                    <div className={`pl-3 py-2 rounded ${isLee ? 'bg-[#F2784B]/[0.04]' : ''}`} style={borderColor ? { borderLeft: `2px solid ${borderColor}`, paddingLeft: '12px' } : {}}>
                      {entry.entry_type === 'ai_summary' ? (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[9px] text-[#9B6DFF]">🤖 AI Summary</span>
                            <span className="text-[8px] text-[#2A3550]">{time}</span>
                          </div>
                          <p className="text-[10px] text-[#8A9BB8] leading-relaxed">{entry.content}</p>
                        </>
                      ) : entry.entry_type === 'resolution' ? (
                        <p className="text-[10px] text-[#4BF2A2]">✅ {entry.content}</p>
                      ) : entry.entry_type === 'escalation' ? (
                        <p className="text-[10px] text-[#E05252]">⚠️ {entry.content}</p>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 mb-1">
                            {/* Avatar initials */}
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-[8px] font-bold text-white shrink-0" style={{ backgroundColor: isLee ? '#F2784B' : '#4B5A7A' }}>
                              {isLee ? '⚡' : (name[0] ?? '?')}
                            </div>
                            <span className={`text-[10px] font-medium ${isLee ? 'text-[#F2784B]' : 'text-[#E8EEF8]'}`}>{name}</span>
                            {role && <span className="text-[8px] text-[#4B5A7A]">{role}</span>}
                            <span className="text-[8px] text-[#2A3550] ml-auto">{time}</span>
                          </div>
                          <p className="text-[10px] text-[#E8EEF8] leading-relaxed whitespace-pre-wrap">{resolveContent(entry.content)}</p>
                          <button onClick={() => { navigator.clipboard.writeText(entry.content); toast.success('Copied') }}
                            className="text-[#2A3550] hover:text-[#4B5A7A] mt-1 opacity-0 hover:opacity-100 transition-opacity">
                            <Copy size={10} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        {/* INTELLIGENCE COLUMN 40% */}
        <div className="w-[40%] min-w-[280px] overflow-y-auto p-3 flex flex-col gap-3">
          {/* AI Summary */}
          <div className="bg-[#080E1C] rounded-lg p-3">
            <button onClick={() => setSummaryOpen(!summaryOpen)} className="flex items-center justify-between w-full mb-1">
              <span className="text-[9px] text-[#9B6DFF]">{summaryOpen ? '▼' : '▶'} AI Summary</span>
              <button onClick={(e) => { e.stopPropagation(); handleSummary() }} disabled={summaryLoading} className="text-[#4B5A7A] hover:text-[#8A9BB8]">
                <RefreshCw size={11} className={summaryLoading ? 'animate-spin' : ''} />
              </button>
            </button>
            {summaryOpen && <p className="text-[10px] text-[#8A9BB8] leading-relaxed">{summary ?? 'Tap ↻ to generate'}</p>}
          </div>

          {/* Proposed Action */}
          {incident.ai_proposal && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider">Proposed Action</span>
                <div className="flex items-center gap-2">
                  {edited && <span className="text-[8px] text-[#E8A838] bg-[#E8A838]/10 px-1 rounded">Edited</span>}
                  <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)]" style={{ color: incident.ai_confidence >= 85 ? '#4BF2A2' : incident.ai_confidence >= 65 ? '#E8A838' : '#E05252' }}>{incident.ai_confidence}%</span>
                </div>
              </div>
              {editing ? (
                <textarea value={proposal} onChange={e => setProposal(e.target.value)}
                  className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-3 text-[11px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 leading-relaxed" rows={6} />
              ) : (
                <div className="bg-[#080E1C] border border-[#1A2035] rounded-lg p-3">
                  <p className="text-[11px] text-[#E8EEF8] leading-relaxed whitespace-pre-wrap">{proposal}</p>
                </div>
              )}
              <button onClick={() => setEditing(!editing)} className="text-[9px] text-[#F2784B] mt-1">{editing ? 'Done editing' : '✏️ Edit'}</button>
            </div>
          )}

          {/* Send as Lee */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider">Send as Lee</span>
              {Boolean((incident as Record<string, unknown>).source_lark_message_id) && <span className="text-[8px] text-[#4BF2A2]">Reply in thread ✓</span>}
            </div>
            <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Type additional instruction..."
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-2 text-[11px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 placeholder:text-[#2A3550]" rows={3} maxLength={500} />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[8px] text-[#2A3550]">{replyText.length}/500</span>
            </div>

            {sent ? (
              <p className="text-[10px] text-[#4BF2A2] mt-2">✓ Sent in thread</p>
            ) : (
              <div className="flex gap-2 mt-2">
                {isAwaiting && incident.ai_proposal && (
                  <button onClick={() => handleSend(true)} disabled={sending}
                    className="flex-1 h-8 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-[10px] font-medium hover:bg-[#4BF2A2]/20 disabled:opacity-50 flex items-center justify-center gap-1">
                    <CheckCircle size={11} /> {sending ? '...' : 'Approve & Send'}
                  </button>
                )}
                <button onClick={() => handleSend(false)} disabled={sending || !replyText.trim()}
                  className="flex-1 h-8 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-[10px] font-medium hover:bg-[#F2784B]/20 disabled:opacity-30 flex items-center justify-center gap-1">
                  <Send size={11} /> {sending ? '...' : 'Send Custom'}
                </button>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="mt-auto pt-3 border-t border-[#1A2035] flex gap-2">
            <button onClick={() => onResolve(incident.id)} disabled={loading}
              className="flex-1 h-8 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-[10px] font-medium hover:bg-[#4BF2A2]/20 disabled:opacity-50 flex items-center justify-center gap-1">
              <CheckCircle size={11} /> Resolve
            </button>
            <button onClick={() => { fetch(`/api/incidents/${incident.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ severity: incident.severity === 'GREEN' ? 'YELLOW' : 'RED' }) }); toast.success('Escalated') }}
              className="h-8 px-3 rounded-lg bg-[#E8A838]/10 text-[#E8A838] text-[10px] hover:bg-[#E8A838]/20 flex items-center gap-1">
              <ArrowUp size={11} />
            </button>
            {isAwaiting && (
              <button onClick={() => onDecide(incident.id, 'rejected')} disabled={loading}
                className="h-8 px-3 rounded-lg text-[#E05252]/50 text-[10px] hover:text-[#E05252] hover:bg-[#E05252]/10 flex items-center gap-1">
                <Archive size={11} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
