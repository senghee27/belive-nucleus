'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowUp, CheckCircle, RefreshCw, Copy, Send } from 'lucide-react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase'
import { formatDistanceToNow } from 'date-fns'

const SEV_COLORS: Record<string, string> = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const CLUSTER_COLORS: Record<string, string> = {
  C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838',
  C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252',
}

type Issue = {
  id: string; created_at: string; cluster: string; chat_id: string; title: string
  severity: string; status: string; priority: string; owner_name: string | null
  days_open: number; escalation_due_at: string | null; escalated: boolean
  follow_up_count: number; last_follow_up_at: string | null; notes: string | null
  ai_summary?: string | null; ai_summary_at?: string | null
  silence_hours?: number | null; message_count?: number
  has_lee_replied?: boolean; thread_keywords?: string[] | null
  [key: string]: unknown
}

type TimelineEntry = {
  id: string; created_at: string; entry_type: string
  sender_name: string | null; content: string
  is_lee: boolean; metadata: Record<string, unknown> | null
}

type Props = {
  issue: Issue
  onClose: () => void
  onAction: (id: string, action: string, payload?: Record<string, unknown>) => Promise<void>
  loading: boolean
}

export function IssueDrawer({ issue, onClose, onAction, loading }: Props) {
  const [timeline, setTimeline] = useState<TimelineEntry[]>([])
  const [timelineLoading, setTimelineLoading] = useState(true)
  const [summaryLoading, setSummaryLoading] = useState(false)
  const [summary, setSummary] = useState(issue.ai_summary ?? null)
  const [replyText, setReplyText] = useState('')
  const [replySending, setReplySending] = useState(false)

  useEffect(() => {
    fetchTimeline()

    const channel = supabase
      .channel(`timeline-${issue.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'issue_timeline_entries',
        filter: `issue_id=eq.${issue.id}`,
      }, (payload) => {
        setTimeline(prev => [...prev, payload.new as TimelineEntry])
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [issue.id])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  async function fetchTimeline() {
    setTimelineLoading(true)
    try {
      const res = await fetch(`/api/issues/${issue.id}/timeline`)
      const data = await res.json()
      if (data.ok) setTimeline(data.entries)
    } catch { /* empty */ }
    finally { setTimelineLoading(false) }
  }

  async function handleGenerateSummary() {
    setSummaryLoading(true)
    try {
      const res = await fetch(`/api/issues/${issue.id}/summary`, { method: 'POST' })
      const data = await res.json()
      if (data.ok) {
        setSummary(data.summary)
        toast.success('Summary generated')
      }
    } catch { toast.error('Failed to generate summary') }
    finally { setSummaryLoading(false) }
  }

  async function handleReply() {
    if (!replyText.trim()) return
    setReplySending(true)
    try {
      const res = await fetch(`/api/issues/${issue.id}/reply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: replyText, chat_id: issue.chat_id, cluster: issue.cluster }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Sent to ${issue.cluster} group`)
        setReplyText('')
      } else {
        toast.error('Failed to send')
      }
    } catch { toast.error('Failed to send') }
    finally { setReplySending(false) }
  }

  const isOverdue = issue.escalation_due_at && new Date(issue.escalation_due_at).getTime() < Date.now()

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <motion.div
        initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[520px] bg-[#0D1525] border-l border-[#1A2035] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1A2035]">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${issue.severity === 'RED' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: SEV_COLORS[issue.severity] ?? '#4B5A7A' }} />
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ color: CLUSTER_COLORS[issue.cluster], backgroundColor: (CLUSTER_COLORS[issue.cluster] ?? '#8A9BB8') + '15' }}>
              {issue.cluster}
            </span>
            <span className="text-[10px] text-[#4B5A7A]">{issue.priority}</span>
            <span className="text-[10px] text-[#4B5A7A]">
              {issue.message_count ?? 0} msgs
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Title + Summary */}
          <div className="p-4 border-b border-[#1A2035]">
            <h3 className="text-base font-semibold text-[#E8EEF8] mb-2">{issue.title}</h3>
            <div className="flex items-center gap-2 text-xs text-[#4B5A7A] mb-3">
              <span>{issue.owner_name ?? 'Unassigned'}</span>
              <span>·</span>
              <span className={isOverdue ? 'text-[#E05252]' : ''}>{issue.days_open}d open</span>
              {issue.silence_hours && issue.silence_hours > 0 && (
                <>
                  <span>·</span>
                  <span className="text-[#E8A838]">⏸ {Math.round(issue.silence_hours)}h silent</span>
                </>
              )}
            </div>

            {/* AI Summary */}
            <div className="bg-[#080E1C] rounded-lg p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-[#9B6DFF]">AI Summary</span>
                <button onClick={handleGenerateSummary} disabled={summaryLoading}
                  className="text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors">
                  <RefreshCw size={12} className={summaryLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              <p className="text-xs text-[#8A9BB8] leading-relaxed">
                {summary ?? 'Tap ↻ to generate summary'}
              </p>
            </div>
          </div>

          {/* Timeline */}
          <div className="p-4 space-y-3">
            <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider">Thread</p>

            {timelineLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-12 bg-[#111D30] rounded-lg animate-pulse" />
                ))}
              </div>
            ) : timeline.length === 0 ? (
              <p className="text-xs text-[#4B5A7A] text-center py-8">
                No thread data yet. Run a cluster scan to populate.
              </p>
            ) : (
              <div className="space-y-2">
                {timeline.map(entry => (
                  <TimelineEntryRow key={entry.id} entry={entry} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Reply + Actions */}
        <div className="border-t border-[#1A2035]">
          {/* Reply box */}
          <div className="p-3 border-b border-[#1A2035]/50">
            <textarea
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              placeholder={`Type instruction to send to ${issue.cluster} group...`}
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-2 text-sm text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 placeholder:text-[#2A3550]"
              rows={2}
            />
            <div className="flex items-center justify-between mt-1">
              <span className="text-[9px] text-[#2A3550]">{replyText.length} chars</span>
              <button
                onClick={handleReply}
                disabled={replySending || !replyText.trim()}
                className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-xs font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-30"
              >
                <Send size={12} />
                {replySending ? 'Sending...' : `Send to ${issue.cluster}`}
              </button>
            </div>
          </div>

          {/* Action buttons */}
          <div className="p-3 flex gap-2">
            <button onClick={() => onAction(issue.id, 'resolve', { status: 'resolved' })}
              disabled={loading}
              className="flex-1 h-9 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-xs font-medium hover:bg-[#4BF2A2]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <CheckCircle size={13} /> Resolve
            </button>
            <button onClick={() => onAction(issue.id, 'escalate')}
              disabled={loading}
              className="flex-1 h-9 rounded-lg bg-[#E8A838]/10 text-[#E8A838] text-xs font-medium hover:bg-[#E8A838]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
              <ArrowUp size={13} /> Escalate
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}

function TimelineEntryRow({ entry }: { entry: TimelineEntry }) {
  const time = formatDistanceToNow(new Date(entry.created_at), { addSuffix: true })

  if (entry.entry_type === 'silence_gap') {
    const hours = (entry.metadata as Record<string, number> | null)?.gap_hours ?? 0
    return (
      <div className="flex items-center gap-2 py-2 px-3 text-[#E8A838]/60">
        <span className="text-[10px]">⏸</span>
        <span className="text-[10px]">{Math.round(hours)}h silence</span>
        <span className="flex-1 border-t border-dashed border-[#E8A838]/20" />
      </div>
    )
  }

  if (entry.entry_type === 'escalation') {
    return (
      <div className="bg-[#E8A838]/5 border-l-2 border-[#E8A838] rounded-r-lg px-3 py-2">
        <p className="text-[10px] text-[#E8A838]">⚠️ {entry.content}</p>
      </div>
    )
  }

  if (entry.entry_type === 'resolution') {
    return (
      <div className="bg-[#4BF2A2]/5 border-l-2 border-[#4BF2A2] rounded-r-lg px-3 py-2">
        <p className="text-[10px] text-[#4BF2A2]">✅ {entry.content}</p>
      </div>
    )
  }

  if (entry.entry_type === 'ai_summary') {
    return (
      <div className="bg-[#9B6DFF]/5 border-l-2 border-[#9B6DFF] rounded-r-lg px-3 py-2">
        <p className="text-[9px] text-[#9B6DFF] mb-1">AI Summary</p>
        <p className="text-xs text-[#8A9BB8]">{entry.content}</p>
      </div>
    )
  }

  const isLee = entry.is_lee || entry.entry_type === 'lee_instruction'

  return (
    <div className={`rounded-lg px-3 py-2 ${isLee ? 'bg-[#F2784B]/5 border-l-2 border-[#F2784B]' : 'bg-[#080E1C]'}`}>
      <div className="flex items-center justify-between mb-1">
        <span className={`text-[10px] font-medium ${isLee ? 'text-[#F2784B]' : 'text-[#8A9BB8]'}`}>
          {isLee ? '⚡ Lee' : entry.sender_name ?? 'Unknown'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-[9px] text-[#2A3550]">{time}</span>
          <button
            onClick={() => { navigator.clipboard.writeText(entry.content); toast.success('Copied') }}
            className="text-[#2A3550] hover:text-[#4B5A7A] transition-colors"
          >
            <Copy size={10} />
          </button>
        </div>
      </div>
      <p className="text-xs text-[#E8EEF8] leading-relaxed whitespace-pre-wrap">{entry.content}</p>
    </div>
  )
}
