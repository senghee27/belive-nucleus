'use client'

import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'
import { Inbox, MessageSquare, MessagesSquare } from 'lucide-react'
import { DecisionDrawer } from './DecisionDrawer'
import type { Decision } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

const AGENT_COLORS: Record<string, string> = {
  ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2',
}
const PRIORITY_COLORS: Record<string, string> = {
  P1: '#E05252', P2: '#E8A838', P3: '#4BB8F2',
}
const STATUS_COLORS: Record<string, string> = {
  pending: '#E8A838', approved: '#4BF2A2', edited: '#4BF2A2', rejected: '#E05252',
}

type Filter = 'all' | 'pending' | 'P1' | 'auto' | 'rejected'
type AgentFilter = 'all' | 'ceo' | 'cfo' | 'coo' | 'cto'

export function DecisionTable({ initialData }: { initialData: Decision[] }) {
  const [decisions, setDecisions] = useState<Decision[]>(initialData)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all')
  const [newIds, setNewIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const channel = supabase
      .channel('decisions-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'decisions' }, (payload) => {
        const newDecision = payload.new as Decision
        setDecisions(prev => [newDecision, ...prev])
        setNewIds(prev => new Set(prev).add(newDecision.id))
        setTimeout(() => {
          setNewIds(prev => {
            const next = new Set(prev)
            next.delete(newDecision.id)
            return next
          })
        }, 1500)

        if (newDecision.priority === 'P1') {
          toast.error('P1 Alert — Needs you now', {
            description: newDecision.ai_summary ?? 'New P1 decision',
            duration: 0,
          })
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'decisions' }, (payload) => {
        const updated = payload.new as Decision
        setDecisions(prev => prev.map(d => d.id === updated.id ? updated : d))
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const handleApprove = useCallback(async (id: string, action: 'approve' | 'edit' | 'reject', lee_edit?: string) => {
    setLoading(true)
    // Optimistic update
    const prevDecisions = decisions
    setDecisions(prev => prev.map(d =>
      d.id === id ? { ...d, status: action === 'reject' ? 'rejected' : action === 'edit' ? 'edited' : 'approved' } as Decision : d
    ))

    try {
      const res = await fetch(`/api/decisions/${id}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, lee_edit }),
      })

      if (!res.ok) throw new Error('Failed')

      const statusLabel = action === 'approve' ? 'approved' : action === 'edit' ? 'edited & sent' : 'rejected'
      toast.success(`Decision ${statusLabel}`)

      if (action === 'reject') {
        const decision = decisions.find(d => d.id === id)
        if (decision?.priority === 'P1') {
          toast.warning('P1 rejected — make sure this is handled elsewhere.')
        }
      }

      setSelectedId(null)
    } catch {
      setDecisions(prevDecisions)
      toast.error('Failed — try again.')
    } finally {
      setLoading(false)
    }
  }, [decisions])

  const filtered = decisions.filter(d => {
    if (filter === 'pending' && d.status !== 'pending') return false
    if (filter === 'P1' && d.priority !== 'P1') return false
    if (filter === 'auto' && !d.auto_executed) return false
    if (filter === 'rejected' && d.status !== 'rejected') return false
    if (agentFilter !== 'all' && d.agent !== agentFilter) return false
    return true
  })

  const selectedDecision = decisions.find(d => d.id === selectedId) ?? null

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'pending', label: 'Pending' },
    { key: 'P1', label: 'P1' },
    { key: 'auto', label: 'Auto' },
    { key: 'rejected', label: 'Rejected' },
  ]

  const agentFilters: { key: AgentFilter; label: string }[] = [
    { key: 'all', label: 'All Agents' },
    { key: 'ceo', label: 'CEO' },
    { key: 'cfo', label: 'CFO' },
    { key: 'coo', label: 'COO' },
    { key: 'cto', label: 'CTO' },
  ]

  return (
    <div className="space-y-4">
      {/* Filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-[#F2784B]/15 text-[#F2784B]'
                : 'text-[#4B5A7A] hover:text-[#8A9BB8] hover:bg-[#111D30]'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="w-px h-4 bg-[#1A2035] mx-1" />
        {agentFilters.map(f => (
          <button
            key={f.key}
            onClick={() => setAgentFilter(f.key)}
            className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${
              agentFilter === f.key
                ? 'bg-[#F2784B]/15 text-[#F2784B]'
                : 'text-[#4B5A7A] hover:text-[#8A9BB8] hover:bg-[#111D30]'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Inbox size={40} className="text-[#1A2035] mb-3" />
          <p className="text-sm font-medium text-[#4B5A7A]">No pending decisions</p>
          <p className="text-xs text-[#2A3550] mt-1">The Twin has nothing waiting for your approval.</p>
        </div>
      ) : (
        <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="border-b border-[#1A2035]">
                  <th className="w-10 p-3" />
                  <th className="w-10 p-3" />
                  <th className="w-20 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Agent</th>
                  <th className="p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Summary</th>
                  <th className="w-24 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider hidden lg:table-cell">Conf.</th>
                  <th className="w-20 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Time</th>
                  <th className="w-20 p-3 text-left text-[10px] font-medium text-[#4B5A7A] uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence initial={false}>
                  {filtered.map((d) => (
                    <motion.tr
                      key={d.id}
                      initial={newIds.has(d.id) ? { opacity: 0, backgroundColor: '#F2784B20' } : false}
                      animate={{ opacity: 1, backgroundColor: 'transparent' }}
                      transition={{ duration: 1.5 }}
                      onClick={() => setSelectedId(d.id)}
                      className={`border-b border-[#1A2035]/50 cursor-pointer transition-colors ${
                        selectedId === d.id
                          ? 'bg-[#0F1829] border-l-[3px] border-l-[#F2784B]'
                          : 'hover:bg-[#0A1020]'
                      }`}
                    >
                      <td className="p-3">
                        <span
                          className="block w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: PRIORITY_COLORS[d.priority] ?? '#4B5A7A' }}
                        />
                      </td>
                      <td className="p-3">
                        {d.source === 'lark' ? (
                          <MessageSquare size={14} className="text-[#4B5A7A]" />
                        ) : (
                          <MessagesSquare size={14} className="text-[#4B5A7A]" />
                        )}
                      </td>
                      <td className="p-3">
                        <span
                          className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                          style={{
                            color: AGENT_COLORS[d.agent ?? ''] ?? '#8A9BB8',
                            backgroundColor: (AGENT_COLORS[d.agent ?? ''] ?? '#8A9BB8') + '15',
                          }}
                        >
                          {d.agent?.toUpperCase()}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className="text-sm text-[#E8EEF8] line-clamp-1">
                          {d.ai_summary}
                        </span>
                      </td>
                      <td className="p-3 hidden lg:table-cell">
                        <div className="flex items-center gap-2">
                          <div className="w-12 h-1 rounded-full bg-[#1A2035] overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${d.ai_confidence}%`,
                                backgroundColor: d.ai_confidence >= 85 ? '#4BF2A2' : d.ai_confidence >= 65 ? '#E8A838' : '#E05252',
                              }}
                            />
                          </div>
                          <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A]">
                            {d.ai_confidence}%
                          </span>
                        </div>
                      </td>
                      <td className="p-3">
                        <span className="text-[11px] text-[#4B5A7A]">
                          {formatDistanceToNow(new Date(d.created_at), { addSuffix: false })}
                        </span>
                      </td>
                      <td className="p-3">
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                          style={{
                            color: STATUS_COLORS[d.status] ?? '#4B5A7A',
                            backgroundColor: (STATUS_COLORS[d.status] ?? '#4B5A7A') + '15',
                          }}
                        >
                          {d.status}
                        </span>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Drawer */}
      <AnimatePresence>
        {selectedDecision && (
          <DecisionDrawer
            decision={selectedDecision}
            onClose={() => setSelectedId(null)}
            onAction={handleApprove}
            loading={loading}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
