'use client'

import { useState, useEffect } from 'react'
import { X, Wrench, Sparkles, LogIn, RefreshCw, MessageSquare, ArrowUp, CheckCircle } from 'lucide-react'
import { toast } from 'sonner'
import type { ClusterHealth } from '@/lib/types'

type Ticket = {
  ticket_id: string; unit_number: string | null; room: string | null
  issue_description: string; category: string; age_days: number
  sla_date: string | null; sla_overdue: boolean; owner_name: string | null
  owner_role: string | null; activity_status: string; summary: string | null
  incident_id: string | null
}

type Tab = 'maintenance' | 'cleaning' | 'move_in' | 'move_out'

const TAB_ICONS = { maintenance: Wrench, cleaning: Sparkles, move_in: LogIn, move_out: RefreshCw }
const STATUS_COLORS: Record<string, string> = { active: '#4BB8F2', silent: '#9B6DFF', overdue: '#E05252', healthy: '#4BF2A2' }

export function ClusterDetailPanel({ cluster: c, color, onClose }: { cluster: ClusterHealth; color: string; onClose: () => void }) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [tab, setTab] = useState<Tab>('maintenance')
  const [loading, setLoading] = useState(true)
  const [askingTicket, setAskingTicket] = useState<Ticket | null>(null)
  const [askMessage, setAskMessage] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/clusters/${c.cluster}`).then(r => r.json()).then(d => {
      if (d.ok) setTickets(d.tickets ?? [])
    }).finally(() => setLoading(false))
  }, [c.cluster])

  const filtered = tickets.filter(t => t.category === tab)
  const counts = { maintenance: tickets.filter(t => t.category === 'maintenance').length, cleaning: tickets.filter(t => t.category === 'cleaning').length, move_in: tickets.filter(t => t.category === 'move_in').length, move_out: tickets.filter(t => t.category === 'move_out').length }

  async function handleAsk(ticket: Ticket) {
    setAskingTicket(ticket)
    setAskMessage('Generating...')
    try {
      const d = await fetch(`/api/clusters/${c.cluster}/ask`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ticket),
      }).then(r => r.json())
      setAskMessage(d.message ?? '')
    } catch { setAskMessage('Failed to generate') }
  }

  async function handleSend() {
    if (!askMessage.trim() || !askingTicket) return
    setSending(true)
    try {
      const d = await fetch(`/api/clusters/${c.cluster}/send`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: askMessage, ticket_id: askingTicket.ticket_id, chat_id: c.chat_id }),
      }).then(r => r.json())
      if (d.ok) { toast.success(`Sent to ${c.cluster}`); setAskingTicket(null) }
    } catch { toast.error('Failed') }
    finally { setSending(false) }
  }

  return (
    <div className="h-full bg-[#0D1525] border border-[#1A2035] rounded-xl flex flex-col overflow-hidden">
      {/* Header */}
      <div className="p-4 border-b border-[#1A2035]">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-sm font-semibold text-[#E8EEF8]">{c.cluster} — {c.cluster_name}</span>
          </div>
          <button onClick={onClose} className="text-[#4B5A7A] hover:text-[#E8EEF8]"><X size={16} /></button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-2xl font-bold font-[family-name:var(--font-jetbrains-mono)]"
            style={{ color: c.health_status === 'red' ? '#E05252' : c.health_status === 'amber' ? '#E8A838' : '#4BF2A2' }}>{c.health_score}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${c.health_status === 'red' ? 'bg-[#E05252]/15 text-[#E05252]' : c.health_status === 'amber' ? 'bg-[#E8A838]/15 text-[#E8A838]' : 'bg-[#4BF2A2]/15 text-[#4BF2A2]'}`}>
            {c.health_status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-[#1A2035]">
        {(['maintenance', 'cleaning', 'move_in', 'move_out'] as Tab[]).map(t => {
          const Icon = TAB_ICONS[t]
          return (
            <button key={t} onClick={() => setTab(t)}
              className={`flex-1 flex items-center justify-center gap-1 py-2 text-[10px] transition-colors ${tab === t ? 'text-[#F2784B] border-b-2 border-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8]'}`}>
              <Icon size={11} /> {counts[t]}
            </button>
          )
        })}
      </div>

      {/* Tickets */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {loading ? (
          <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-[#111D30] rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center py-12 text-center">
            <CheckCircle size={24} className="text-[#4BF2A2]/30 mb-2" />
            <p className="text-xs text-[#4B5A7A]">All clear</p>
          </div>
        ) : (
          filtered.map(ticket => (
            <div key={ticket.ticket_id} className="bg-[#080E1C] border border-[#1A2035] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] text-[#8A9BB8]">{ticket.ticket_id}</span>
                <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)]"
                  style={{ color: STATUS_COLORS[ticket.activity_status] ?? '#4B5A7A' }}>
                  {ticket.age_days.toFixed(1)}d {ticket.sla_overdue ? 'OVR' : ticket.activity_status === 'active' ? 'ACT' : ticket.activity_status === 'silent' ? 'SIL' : ''}
                </span>
              </div>
              <p className="text-xs text-[#E8EEF8] mb-1">{ticket.unit_number} {ticket.room ?? ''}</p>
              <p className="text-[10px] text-[#8A9BB8] mb-2 line-clamp-1">{ticket.issue_description}</p>
              {ticket.owner_name && <p className="text-[9px] text-[#4B5A7A] mb-2">[{ticket.owner_role}] {ticket.owner_name}</p>}

              {/* Turnaround progress bar */}
              {tab === 'move_out' && (
                <div className="mb-2">
                  <div className="w-full h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.min(100, (ticket.age_days / 7) * 100)}%`,
                      backgroundColor: ticket.age_days >= 7 ? '#E05252' : ticket.age_days >= 4 ? '#E8A838' : '#4BF2A2',
                    }} />
                  </div>
                  <p className="text-[8px] text-[#4B5A7A] mt-0.5">Day {Math.round(ticket.age_days)}/7</p>
                </div>
              )}

              <div className="flex gap-1.5">
                <button onClick={() => handleAsk(ticket)} className="px-2 py-1 rounded bg-[#F2784B]/10 text-[#F2784B] text-[9px] hover:bg-[#F2784B]/20">
                  <MessageSquare size={9} className="inline mr-0.5" /> Ask
                </button>
                <button onClick={() => toast.info('Escalate from Command Center')} className="px-2 py-1 rounded bg-[#E8A838]/10 text-[#E8A838] text-[9px] hover:bg-[#E8A838]/20">
                  <ArrowUp size={9} className="inline mr-0.5" /> Esc
                </button>
                <button onClick={() => toast.success('Marked resolved')} className="px-2 py-1 rounded bg-[#4BF2A2]/10 text-[#4BF2A2] text-[9px] hover:bg-[#4BF2A2]/20">
                  <CheckCircle size={9} className="inline mr-0.5" /> Done
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Ask Message Modal */}
      {askingTicket && (
        <div className="p-3 border-t border-[#1A2035] bg-[#0D1525]">
          <p className="text-[9px] text-[#4B5A7A] mb-1">Send to {c.cluster} · Re: {askingTicket.ticket_id}</p>
          <textarea value={askMessage} onChange={e => setAskMessage(e.target.value)}
            className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-2 text-[11px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50" rows={3} />
          <div className="flex gap-2 mt-2">
            <button onClick={() => setAskingTicket(null)} className="flex-1 h-8 rounded-lg text-[10px] text-[#4B5A7A] hover:bg-[#111D30]">Cancel</button>
            <button onClick={handleSend} disabled={sending} className="flex-1 h-8 rounded-lg bg-[#F2784B] text-white text-[10px] font-medium hover:bg-[#E0673D] disabled:opacity-50">
              {sending ? 'Sending...' : `Send to ${c.cluster} →`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
