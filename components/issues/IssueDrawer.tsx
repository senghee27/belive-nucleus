'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { X, ArrowUp, CheckCircle, Send } from 'lucide-react'
type Issue = {
  id: string; created_at: string; cluster: string; chat_id: string; title: string
  severity: string; status: string; priority: string; owner_name: string | null
  days_open: number; escalation_due_at: string | null; escalated: boolean
  follow_up_count: number; last_follow_up_at: string | null; notes: string | null
  source_message_id: string | null; cluster_color: string | null
  owner_open_id: string | null; resolved_at: string | null; resolved_by: string | null
  decision_id: string | null; last_activity: string | null; updated_at: string
}

const CLUSTER_COLORS: Record<string, string> = {
  C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838',
  C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252',
}
import { formatDistanceToNow } from 'date-fns'

const SEV_COLORS: Record<string, string> = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }

type Props = {
  issue: Issue
  onClose: () => void
  onAction: (id: string, action: string, payload?: Record<string, unknown>) => Promise<void>
  loading: boolean
}

export function IssueDrawer({ issue, onClose, onAction, loading }: Props) {
  const [showFollowUp, setShowFollowUp] = useState(false)
  const [followUpText, setFollowUpText] = useState(
    `What's the latest on this? Tenant been waiting quite long already. Update me by EOD please.`
  )

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const isOverdue = issue.escalation_due_at && new Date(issue.escalation_due_at).getTime() < Date.now()

  return (
    <>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />

      <motion.div
        initial={{ x: '100%', opacity: 0 }} animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#0D1525] border-l border-[#1A2035] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1A2035]">
          <div className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full ${issue.severity === 'RED' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: SEV_COLORS[issue.severity] ?? '#4B5A7A' }} />
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{ color: CLUSTER_COLORS[issue.cluster] ?? '#8A9BB8', backgroundColor: (CLUSTER_COLORS[issue.cluster] ?? '#8A9BB8') + '15' }}>
              {issue.cluster}
            </span>
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{ color: SEV_COLORS[issue.severity], backgroundColor: (SEV_COLORS[issue.severity] ?? '#4B5A7A') + '15' }}>
              {issue.severity}
            </span>
            <span className="text-[10px] text-[#4B5A7A]">{issue.priority}</span>
          </div>
          <button onClick={onClose} className="p-1 text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h3 className="text-base font-semibold text-[#E8EEF8]">{issue.title}</h3>

          <p className="text-xs text-[#4B5A7A]">
            Detected from <span className="text-[#8A9BB8]">{issue.cluster}</span> group chat
            · {formatDistanceToNow(new Date(issue.created_at), { addSuffix: true })}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-[#080E1C] rounded-lg p-3">
              <p className="text-[10px] text-[#4B5A7A] mb-1">Owner</p>
              <p className="text-sm text-[#E8EEF8]">{issue.owner_name ?? 'Unassigned'}</p>
            </div>
            <div className="bg-[#080E1C] rounded-lg p-3">
              <p className="text-[10px] text-[#4B5A7A] mb-1">Age</p>
              <p className={`text-sm font-[family-name:var(--font-jetbrains-mono)] ${isOverdue ? 'text-[#E05252]' : 'text-[#E8EEF8]'}`}>
                {issue.days_open}d {isOverdue ? '(overdue)' : ''}
              </p>
            </div>
          </div>

          <div className="bg-[#080E1C] rounded-lg p-3 space-y-2">
            <div className="flex justify-between">
              <span className="text-[10px] text-[#4B5A7A]">Escalation due</span>
              <span className={`text-[10px] font-[family-name:var(--font-jetbrains-mono)] ${isOverdue ? 'text-[#E05252]' : 'text-[#4B5A7A]'}`}>
                {issue.escalation_due_at ? new Date(issue.escalation_due_at).toLocaleString('en-MY') : 'Not set'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] text-[#4B5A7A]">Follow-ups sent</span>
              <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] text-[#E8EEF8]">{issue.follow_up_count}</span>
            </div>
            {issue.last_follow_up_at && (
              <div className="flex justify-between">
                <span className="text-[10px] text-[#4B5A7A]">Last follow-up</span>
                <span className="text-[10px] text-[#4B5A7A]">
                  {formatDistanceToNow(new Date(issue.last_follow_up_at), { addSuffix: true })}
                </span>
              </div>
            )}
          </div>

          {issue.notes && (
            <div className="bg-[#080E1C] rounded-lg p-3">
              <p className="text-[10px] text-[#4B5A7A] mb-1">Notes</p>
              <p className="text-xs text-[#8A9BB8]">{issue.notes}</p>
            </div>
          )}

          {/* Follow-up section */}
          {showFollowUp && (
            <div className="bg-[#080E1C] rounded-lg p-3 space-y-2">
              <p className="text-[10px] text-[#4B5A7A]">Follow-up message to {issue.cluster} group</p>
              <textarea
                value={followUpText}
                onChange={e => setFollowUpText(e.target.value)}
                className="w-full bg-[#0D1525] border border-[#1A2035] rounded-lg p-2 text-sm text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50"
                rows={3}
              />
              <button
                onClick={() => onAction(issue.id, 'follow_up', { message: followUpText })}
                disabled={loading}
                className="w-full h-8 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-xs font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50"
              >
                {loading ? 'Sending...' : 'Send to Group'}
              </button>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 border-t border-[#1A2035] flex gap-2">
          <button onClick={() => onAction(issue.id, 'resolve', { status: 'resolved' })}
            disabled={loading}
            className="flex-1 h-10 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-sm font-medium hover:bg-[#4BF2A2]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
            <CheckCircle size={14} /> Resolve
          </button>
          <button onClick={() => onAction(issue.id, 'escalate')}
            disabled={loading}
            className="flex-1 h-10 rounded-lg bg-[#E8A838]/10 text-[#E8A838] text-sm font-medium hover:bg-[#E8A838]/20 transition-colors disabled:opacity-50 flex items-center justify-center gap-1">
            <ArrowUp size={14} /> Escalate
          </button>
          <button onClick={() => setShowFollowUp(!showFollowUp)}
            className="flex-1 h-10 rounded-lg bg-[#F2784B]/10 text-[#F2784B] text-sm font-medium hover:bg-[#F2784B]/20 transition-colors flex items-center justify-center gap-1">
            <Send size={14} /> Follow-up
          </button>
        </div>
      </motion.div>
    </>
  )
}
