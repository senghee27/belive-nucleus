'use client'

import { useState, useEffect, useRef } from 'react'
import { motion } from 'framer-motion'
import { X, ChevronDown, ChevronUp } from 'lucide-react'
import type { Decision } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

const AGENT_COLORS: Record<string, string> = {
  ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2',
}
const PRIORITY_COLORS: Record<string, string> = {
  P1: '#E05252', P2: '#E8A838', P3: '#4BB8F2',
}

type Props = {
  decision: Decision
  onClose: () => void
  onAction: (id: string, action: 'approve' | 'edit' | 'reject', lee_edit?: string) => Promise<void>
  loading: boolean
}

export function DecisionDrawer({ decision, onClose, onAction, loading }: Props) {
  const [editedText, setEditedText] = useState(decision.ai_proposal ?? '')
  const [showReasoning, setShowReasoning] = useState(false)
  const [confirmReject, setConfirmReject] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isEdited = editedText !== (decision.ai_proposal ?? '')

  useEffect(() => {
    setEditedText(decision.ai_proposal ?? '')
    setConfirmReject(false)
  }, [decision.id, decision.ai_proposal])

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px'
    }
  }, [editedText])

  useEffect(() => {
    function handleEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const confidenceColor = decision.ai_confidence >= 85
    ? '#4BF2A2'
    : decision.ai_confidence >= 65
      ? '#E8A838'
      : '#E05252'

  const isPending = decision.status === 'pending'

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <motion.div
        initial={{ x: '100%', opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: '100%', opacity: 0 }}
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        className="fixed top-0 right-0 bottom-0 z-50 w-full md:w-[480px] bg-[#0D1525] border-l border-[#1A2035] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1A2035]">
          <div className="flex items-center gap-2">
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded"
              style={{
                color: AGENT_COLORS[decision.agent ?? ''] ?? '#8A9BB8',
                backgroundColor: (AGENT_COLORS[decision.agent ?? ''] ?? '#8A9BB8') + '15',
              }}
            >
              {decision.agent?.toUpperCase()}
            </span>
            <span className="text-xs text-[#4B5A7A]">{decision.problem_type}</span>
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
              style={{
                color: PRIORITY_COLORS[decision.priority] ?? '#4B5A7A',
                backgroundColor: (PRIORITY_COLORS[decision.priority] ?? '#4B5A7A') + '15',
              }}
            >
              {decision.priority}
            </span>
          </div>
          <button onClick={onClose} className="p-1 text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Time */}
          <p className="text-[11px] text-[#4B5A7A]">
            {formatDistanceToNow(new Date(decision.created_at), { addSuffix: true })}
            {' via '}
            <span className="text-[#8A9BB8]">{decision.source}</span>
          </p>

          {/* Summary */}
          <div>
            <p className="text-xs text-[#4B5A7A] mb-1">Summary</p>
            <p className="text-sm text-[#E8EEF8]">{decision.ai_summary}</p>
          </div>

          {/* AI Proposal */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <p className="text-xs text-[#4B5A7A]">Proposed Reply</p>
              {isEdited && (
                <span className="text-[9px] text-[#E8A838] bg-[#E8A838]/10 px-1.5 py-0.5 rounded">
                  Edited
                </span>
              )}
            </div>
            {isPending ? (
              <textarea
                ref={textareaRef}
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg p-3 text-sm text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50 transition-colors"
                rows={4}
              />
            ) : (
              <div className="bg-[#080E1C] border border-[#1A2035] rounded-lg p-3 text-sm text-[#E8EEF8] whitespace-pre-wrap">
                {decision.final_reply ?? decision.ai_proposal}
              </div>
            )}
          </div>

          {/* Reasoning (collapsible) */}
          <div>
            <button
              onClick={() => setShowReasoning(!showReasoning)}
              className="flex items-center gap-1 text-xs text-[#4B5A7A] hover:text-[#8A9BB8] transition-colors"
            >
              {showReasoning ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              Reasoning
            </button>
            {showReasoning && (
              <p className="mt-2 text-xs text-[#8A9BB8] leading-relaxed bg-[#080E1C] border border-[#1A2035] rounded-lg p-3">
                {decision.ai_reasoning}
              </p>
            )}
          </div>

          {/* Confidence */}
          <div className="flex items-center gap-3">
            <span className="text-xs text-[#4B5A7A]">Confidence</span>
            <div className="w-20 h-1.5 rounded-full bg-[#1A2035] overflow-hidden">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${decision.ai_confidence}%`, backgroundColor: confidenceColor }}
              />
            </div>
            <span
              className="text-xs font-[family-name:var(--font-jetbrains-mono)] font-medium"
              style={{ color: confidenceColor }}
            >
              {decision.ai_confidence}%
            </span>
          </div>

          {/* Status for non-pending */}
          {!isPending && (
            <div className="bg-[#080E1C] border border-[#1A2035] rounded-lg p-3">
              <span className="text-xs text-[#4B5A7A]">Status: </span>
              <span className="text-xs font-medium" style={{
                color: decision.status === 'rejected' ? '#E05252' : '#4BF2A2'
              }}>
                {decision.status}
              </span>
            </div>
          )}
        </div>

        {/* Actions — sticky bottom */}
        {isPending && (
          <div className="p-4 border-t border-[#1A2035] flex gap-2">
            <button
              onClick={() => onAction(decision.id, 'approve')}
              disabled={loading}
              className="flex-1 h-10 rounded-lg bg-[#4BF2A2]/10 text-[#4BF2A2] text-sm font-medium hover:bg-[#4BF2A2]/20 transition-colors disabled:opacity-50"
            >
              {loading ? '...' : 'Approve'}
            </button>
            {isEdited && (
              <button
                onClick={() => onAction(decision.id, 'edit', editedText)}
                disabled={loading}
                className="flex-1 h-10 rounded-lg bg-[#E8A838]/10 text-[#E8A838] text-sm font-medium hover:bg-[#E8A838]/20 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Edit & Send'}
              </button>
            )}
            {confirmReject ? (
              <button
                onClick={() => onAction(decision.id, 'reject')}
                disabled={loading}
                className="flex-1 h-10 rounded-lg bg-[#E05252]/20 text-[#E05252] text-sm font-medium hover:bg-[#E05252]/30 transition-colors disabled:opacity-50"
              >
                {loading ? '...' : 'Confirm Reject'}
              </button>
            ) : (
              <button
                onClick={() => setConfirmReject(true)}
                className="h-10 px-4 rounded-lg text-[#E05252]/60 text-sm hover:text-[#E05252] hover:bg-[#E05252]/10 transition-colors"
              >
                Reject
              </button>
            )}
          </div>
        )}
      </motion.div>
    </>
  )
}
