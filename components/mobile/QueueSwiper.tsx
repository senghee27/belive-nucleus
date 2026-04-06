'use client'

import { useState, useCallback } from 'react'
import { useSpring, animated } from '@react-spring/web'
import { useDrag } from '@use-gesture/react'
import { toast } from 'sonner'
import { BottomSheet } from './BottomSheet'
import type { Incident } from '@/lib/types'

const SWIPE_THRESHOLD = 120
const ROTATION_FACTOR = 0.1
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

export function QueueSwiper({ incidents: initialIncidents }: { incidents: Incident[] }) {
  const [incidents, setIncidents] = useState(initialIncidents)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [action, setAction] = useState<'approve' | 'skip' | null>(null)
  const [editOpen, setEditOpen] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [editText, setEditText] = useState('')
  const [sending, setSending] = useState(false)

  const [{ x, rotate, opacity }, api] = useSpring(() => ({ x: 0, rotate: 0, opacity: 1 }))

  const current = incidents[currentIndex]
  const total = incidents.length

  const advanceCard = useCallback(() => {
    setTimeout(() => {
      setCurrentIndex(i => i + 1)
      api.start({ x: 0, rotate: 0, opacity: 1, immediate: true })
      setAction(null)
    }, 300)
  }, [api])

  const handleApprove = useCallback(async (inc: Incident) => {
    setSending(true)
    try {
      await fetch(`/api/m/incidents/${inc.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      toast.success('Approved & sent')
    } catch { toast.error('Failed to approve') }
    finally { setSending(false) }
  }, [])

  const handleSkip = useCallback(() => {
    // Move to end of queue
    setIncidents(prev => {
      const next = [...prev]
      const skipped = next.splice(currentIndex, 1)
      next.push(...skipped)
      return next
    })
    api.start({ x: 0, rotate: 0, opacity: 1, immediate: true })
    setAction(null)
  }, [currentIndex, api])

  const handleEdit = useCallback(() => {
    if (!current) return
    setEditText(current.ai_proposal ?? current.title)
    setEditOpen(true)
  }, [current])

  const handleSendEdited = useCallback(async () => {
    if (!current) return
    setSending(true)
    try {
      await fetch(`/api/m/incidents/${current.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', edited_message: editText }),
      })
      toast.success('Sent edited message')
      setEditOpen(false)
      advanceCard()
    } catch { toast.error('Failed to send') }
    finally { setSending(false) }
  }, [current, editText, advanceCard])

  const bind = useDrag(({ active, movement: [mx], last }) => {
    if (active) {
      api.start({ x: mx, rotate: mx * ROTATION_FACTOR, opacity: 1 - Math.abs(mx) / 400, immediate: true })
      if (mx > 60) setAction('approve')
      else if (mx < -60) setAction('skip')
      else setAction(null)
    }
    if (last) {
      if (mx > SWIPE_THRESHOLD) {
        api.start({ x: 500, rotate: 30, opacity: 0 })
        if (current) handleApprove(current)
        advanceCard()
      } else if (mx < -SWIPE_THRESHOLD) {
        api.start({ x: -500, rotate: -30, opacity: 0 })
        handleSkip()
      } else {
        api.start({ x: 0, rotate: 0, opacity: 1 })
        setAction(null)
      }
    }
  }, { filterTaps: true, axis: 'x' })

  // Empty state
  if (currentIndex >= total) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <span className="text-4xl mb-3">✅</span>
        <p className="text-[17px] font-semibold text-[#E8EEF8]">Queue cleared!</p>
        <p className="text-[13px] text-[#4B5A7A] mt-1">Nothing waiting for your decision.</p>
        <button onClick={() => { setCurrentIndex(0); setIncidents(initialIncidents) }}
          className="mt-4 px-4 py-2 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">↻ Refresh</button>
      </div>
    )
  }

  const inc = current
  const ageDays = Math.round((Date.now() - new Date(inc.created_at).getTime()) / 86400000)
  const confidence = inc.ai_confidence ?? 0

  return (
    <div className="flex flex-col h-full px-4 py-3">
      {/* Swipe indicators */}
      <div className="relative flex-1 min-h-0">
        {action === 'approve' && (
          <div className="absolute left-4 top-1/2 -translate-y-1/2 z-10 bg-[#4BF2A2] text-white text-sm font-bold px-4 py-2 rounded-xl rotate-[-12deg]">✓ APPROVE</div>
        )}
        {action === 'skip' && (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 z-10 bg-[#E8A838] text-white text-sm font-bold px-4 py-2 rounded-xl rotate-[12deg]">→ SKIP</div>
        )}

        {/* Next card peeking */}
        {incidents[currentIndex + 1] && (
          <div className="absolute inset-x-2 top-2 bg-[#0D1525] border border-[#1A2035] rounded-[14px] p-4 opacity-40 scale-[0.95]" />
        )}

        {/* Current card */}
        <animated.div {...bind()} style={{ x, rotate, opacity, touchAction: 'none' }}
          className="bg-[#0D1525] border border-[#1A2035] rounded-[14px] p-4 relative z-10">
          {/* Meta row */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {inc.cluster && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-[family-name:var(--font-jetbrains-mono)]"
                style={{ color: CLUSTER_COLORS[inc.cluster], backgroundColor: (CLUSTER_COLORS[inc.cluster] ?? '#4B5A7A') + '15' }}>
                {inc.cluster}
              </span>
            )}
            <span className="text-[10px] text-[#4B5A7A]">{inc.agent?.toUpperCase()}</span>
            <span className={`text-[10px] font-bold ${inc.priority === 'P1' ? 'text-[#E05252]' : inc.priority === 'P2' ? 'text-[#E8A838]' : 'text-[#4B5A7A]'}`}>{inc.priority}</span>
            {inc.silence_hours > 3 && <span className="text-[10px] text-[#E8A838]">SILENT {Math.round(inc.silence_hours)}h</span>}
          </div>

          <div className="h-px bg-[#1A2035] mb-3" />

          {/* Title */}
          <p className="text-[17px] font-semibold text-[#E8EEF8] leading-snug mb-1">{inc.title}</p>
          <p className="text-[13px] text-[#8A9BB8] mb-3">
            {inc.sender_name ?? '—'} · {ageDays}d
            {ageDays > 30 && <span className="text-[#E05252]"> · SLA breached</span>}
          </p>

          <div className="h-px bg-[#1A2035] mb-3" />

          {/* AI Proposal */}
          {inc.ai_proposal && (
            <>
              <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-1.5">AI PROPOSED ACTION</p>
              <p className="text-[13px] text-[#E8EEF8] leading-relaxed mb-2 whitespace-pre-wrap">{inc.ai_proposal}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-[10px] text-[#4B5A7A]">Confidence:</span>
                <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden max-w-[120px]">
                  <div className="h-full rounded-full" style={{ width: `${confidence}%`, backgroundColor: confidence >= 80 ? '#4BF2A2' : confidence >= 50 ? '#E8A838' : '#E05252' }} />
                </div>
                <span className="text-[10px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{confidence}%</span>
              </div>
            </>
          )}
        </animated.div>
      </div>

      {/* Progress bar */}
      <div className="flex items-center gap-2 py-2">
        <div className="flex-1 h-1 bg-[#1A2035] rounded-full overflow-hidden">
          <div className="h-full bg-[#F2784B] rounded-full transition-all" style={{ width: `${((currentIndex + 1) / total) * 100}%` }} />
        </div>
        <span className="text-[10px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">{currentIndex + 1}/{total}</span>
      </div>

      {/* Action buttons — thumb zone */}
      <div className="flex gap-2 py-2">
        <button onClick={handleEdit}
          className="h-11 px-4 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">✏️ Edit</button>
        <button onClick={() => setConfirmOpen(true)} disabled={sending}
          className="flex-1 h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold disabled:opacity-50">
          ✓ Approve & Send
        </button>
        <button onClick={handleSkip}
          className="h-11 px-4 rounded-[10px] bg-[#111D30] text-[13px] text-[#4B5A7A]">Skip</button>
      </div>

      {/* Edit Sheet */}
      <BottomSheet isOpen={editOpen} onClose={() => setEditOpen(false)} height="75vh">
        <div className="p-4">
          <p className="text-[13px] font-semibold text-[#E8EEF8] mb-3">Edit Message · {inc.cluster} Group</p>
          <textarea value={editText} onChange={e => setEditText(e.target.value)}
            className="w-full min-h-[160px] bg-[#080E1C] border border-[#2E4070] rounded-[10px] p-3.5 text-[15px] text-[#E8EEF8] leading-relaxed resize-none focus:outline-none focus:border-[#F2784B]/50" />
          <p className="text-right text-[12px] text-[#4B5A7A] mt-1">{editText.length} chars</p>
          <p className="text-[12px] text-[#4B5A7A] mt-2">Sending to: {inc.cluster} — {inc.group_name ?? 'Group'}</p>
          <div className="flex gap-2 mt-4">
            <button onClick={() => setEditOpen(false)} className="flex-1 h-11 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">Cancel</button>
            <button onClick={handleSendEdited} disabled={sending}
              className="flex-1 h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold disabled:opacity-50">
              ✓ Send Edited
            </button>
          </div>
        </div>
      </BottomSheet>

      {/* Confirm Sheet */}
      <BottomSheet isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} height="auto">
        <div className="p-4">
          <p className="text-[13px] font-semibold text-[#E8EEF8] mb-3">Sending to:</p>
          <div className="flex items-center gap-2 bg-[#080E1C] rounded-[10px] p-3 mb-3">
            <span className="text-[14px]">👥</span>
            <span className="text-[13px] text-[#E8EEF8]">{inc.cluster} — {inc.group_name ?? 'Group'}</span>
          </div>
          <p className="text-[12px] text-[#4B5A7A] mb-1">Preview:</p>
          <p className="text-[13px] text-[#8A9BB8] line-clamp-3 mb-4">{inc.ai_proposal?.slice(0, 150)}...</p>
          <div className="flex gap-2">
            <button onClick={() => setConfirmOpen(false)} className="flex-1 h-11 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">Cancel</button>
            <button onClick={async () => {
              setConfirmOpen(false)
              await handleApprove(inc)
              advanceCard()
            }} disabled={sending}
              className="flex-1 h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold disabled:opacity-50">
              ✓ Send Now
            </button>
          </div>
        </div>
      </BottomSheet>
    </div>
  )
}
