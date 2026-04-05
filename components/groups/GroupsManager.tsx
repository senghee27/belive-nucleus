'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Plus, Pause, Play, ExternalLink, Settings } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import Link from 'next/link'

type Group = {
  id: string; chat_id: string; group_name: string; cluster: string
  cluster_color: string; location: string | null; group_type: string
  context: string | null; agent: string; scanning_enabled: boolean
  scan_frequency_minutes: number; last_scanned_at: string | null
  message_count_total: number; issue_count_total: number; active_issues: number
  notes: string | null; added_by: string; created_at: string; updated_at: string
}

export function GroupsManager({ initialGroups }: { initialGroups: Group[] }) {
  const [groups, setGroups] = useState<Group[]>(initialGroups)
  const [showAdd, setShowAdd] = useState(false)

  const scanning = groups.filter(g => g.scanning_enabled).length
  const paused = groups.length - scanning
  const totalIssues = groups.reduce((sum, g) => sum + (g.active_issues ?? 0), 0)

  async function toggleScanning(group: Group) {
    const newState = !group.scanning_enabled
    try {
      const res = await fetch(`/api/groups/${group.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanning_enabled: newState }),
      })
      if (!res.ok) throw new Error()
      setGroups(prev => prev.map(g => g.id === group.id ? { ...g, scanning_enabled: newState } : g))
      toast.success(`${group.cluster} ${newState ? 'resumed' : 'paused'}`)
    } catch {
      toast.error('Failed to update')
    }
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-[#E8EEF8]">Groups</h2>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F2784B] text-white text-xs font-medium hover:bg-[#E0673D] transition-colors"
        >
          <Plus size={14} /> Add Group
        </button>
      </div>

      {/* Stats */}
      <div className="flex gap-4 text-xs text-[#4B5A7A]">
        <span>{groups.length} groups</span>
        <span className="text-[#4BF2A2]">{scanning} scanning</span>
        {paused > 0 && <span className="text-[#E8A838]">{paused} paused</span>}
        {totalIssues > 0 && <span className="text-[#E05252]">{totalIssues} active issues</span>}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {groups.map(group => (
          <div
            key={group.id}
            className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4 relative overflow-hidden"
          >
            {/* Color accent */}
            <div
              className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl"
              style={{ backgroundColor: group.cluster_color }}
            />

            {/* Header */}
            <div className="flex items-center justify-between mb-2 pl-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: group.cluster_color }}
                />
                <span className="text-sm font-medium text-[#E8EEF8]">{group.cluster}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${group.scanning_enabled ? 'bg-[#4BF2A2]/10 text-[#4BF2A2]' : 'bg-[#E8A838]/10 text-[#E8A838]'}`}>
                  {group.scanning_enabled ? 'scanning' : 'paused'}
                </span>
              </div>
            </div>

            {/* Name + Location */}
            <div className="pl-2 mb-3">
              <p className="text-xs text-[#8A9BB8]">{group.group_name}</p>
              {group.location && (
                <p className="text-[10px] text-[#4B5A7A] mt-0.5">{group.location}</p>
              )}
            </div>

            {/* Stats */}
            <div className="pl-2 flex items-center gap-3 text-[10px] text-[#4B5A7A] mb-3">
              <span style={{ color: AGENT_COLORS[group.agent] }}>
                {group.agent.toUpperCase()} agent
              </span>
              {group.last_scanned_at && (
                <span>Scanned {formatDistanceToNow(new Date(group.last_scanned_at), { addSuffix: true })}</span>
              )}
            </div>

            <div className="pl-2 flex items-center gap-3 text-[10px] mb-3">
              {group.active_issues > 0 && (
                <span className="text-[#E05252]">{group.active_issues} issues</span>
              )}
              <span className="text-[#4B5A7A]">{group.message_count_total} msgs</span>
            </div>

            {/* Context preview */}
            {group.context && (
              <p className="pl-2 text-[10px] text-[#2A3550] line-clamp-2 mb-3">{group.context}</p>
            )}

            {/* Actions */}
            <div className="pl-2 flex items-center gap-2">
              <button
                onClick={() => toggleScanning(group)}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#8A9BB8] hover:bg-[#111D30] transition-colors"
              >
                {group.scanning_enabled ? <Pause size={10} /> : <Play size={10} />}
                {group.scanning_enabled ? 'Pause' : 'Resume'}
              </button>
              <Link
                href={`/command?cluster=${group.cluster}`}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#8A9BB8] hover:bg-[#111D30] transition-colors"
              >
                <ExternalLink size={10} /> Issues
              </Link>
              <button
                onClick={() => toast.info('Edit coming soon')}
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-[#8A9BB8] hover:bg-[#111D30] transition-colors"
              >
                <Settings size={10} /> Edit
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Add Group Modal placeholder */}
      {showAdd && (
        <AddGroupModal onClose={() => setShowAdd(false)} onAdded={(g) => { setGroups(prev => [...prev, g]); setShowAdd(false) }} />
      )}
    </div>
  )
}

function AddGroupModal({ onClose, onAdded }: { onClose: () => void; onAdded: (g: Group) => void }) {
  const [chatId, setChatId] = useState('')
  const [verified, setVerified] = useState<{ valid: boolean; name?: string } | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [name, setName] = useState('')
  const [cluster, setCluster] = useState('')
  const [location, setLocation] = useState('')
  const [context, setContext] = useState('')
  const [agent, setAgent] = useState('coo')
  const [color, setColor] = useState('#F2784B')
  const [submitting, setSubmitting] = useState(false)

  async function handleVerify() {
    if (!chatId.trim()) return
    setVerifying(true)
    try {
      const res = await fetch('/api/groups/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId }),
      })
      const data = await res.json()
      setVerified(data)
      if (data.valid && data.group_info?.name) {
        setName(data.group_info.name)
      }
    } catch {
      setVerified({ valid: false })
    } finally {
      setVerifying(false)
    }
  }

  async function handleSubmit() {
    if (!chatId || !name || !cluster) { toast.error('Fill required fields'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId, group_name: name, cluster, location, context, agent, cluster_color: color,
        }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Group added')
        onAdded(data.group)
      } else {
        toast.error(data.error ?? 'Failed')
      }
    } catch {
      toast.error('Failed to add group')
    } finally {
      setSubmitting(false)
    }
  }

  const colors = ['#F2784B', '#9B6DFF', '#4BB8F2', '#4BF2A2', '#E8A838', '#F27BAD', '#6DD5F2', '#E05252']
  const agents = ['coo', 'ceo', 'cfo', 'cto']

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} />
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[#0D1525] border border-[#1A2035] rounded-xl p-6 max-h-[80vh] overflow-y-auto">
        <h3 className="text-sm font-medium text-[#E8EEF8] mb-4">Add Group</h3>

        <div className="space-y-3">
          {/* Chat ID + Verify */}
          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Lark Chat ID</label>
            <div className="flex gap-2">
              <input value={chatId} onChange={e => setChatId(e.target.value)}
                placeholder="oc_..." className="flex-1 bg-[#080E1C] border border-[#1A2035] rounded-lg px-3 py-2 text-sm text-[#E8EEF8] focus:outline-none focus:border-[#F2784B]/50" />
              <button onClick={handleVerify} disabled={verifying}
                className="px-3 py-2 rounded-lg bg-[#111D30] text-xs text-[#E8EEF8] hover:bg-[#162038] disabled:opacity-50">
                {verifying ? '...' : 'Verify'}
              </button>
            </div>
            {verified && (
              <p className={`text-[10px] mt-1 ${verified.valid ? 'text-[#4BF2A2]' : 'text-[#E05252]'}`}>
                {verified.valid ? `✓ Bot is in this group — ${verified.name}` : '✗ Bot not in group'}
              </p>
            )}
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Group Name</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg px-3 py-2 text-sm text-[#E8EEF8] focus:outline-none focus:border-[#F2784B]/50" />
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Cluster</label>
            <input value={cluster} onChange={e => setCluster(e.target.value)}
              placeholder="C12 or Custom" className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg px-3 py-2 text-sm text-[#E8EEF8] focus:outline-none focus:border-[#F2784B]/50" />
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Location</label>
            <input value={location} onChange={e => setLocation(e.target.value)}
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg px-3 py-2 text-sm text-[#E8EEF8] focus:outline-none focus:border-[#F2784B]/50" />
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Agent</label>
            <div className="flex gap-2">
              {agents.map(a => (
                <button key={a} onClick={() => setAgent(a)}
                  className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors ${agent === a ? 'bg-opacity-15 border' : 'text-[#4B5A7A] hover:bg-[#111D30]'}`}
                  style={agent === a ? { color: AGENT_COLORS[a], backgroundColor: AGENT_COLORS[a] + '15', borderColor: AGENT_COLORS[a] + '30' } : {}}>
                  {a.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Color</label>
            <div className="flex gap-2">
              {colors.map(c => (
                <button key={c} onClick={() => setColor(c)}
                  className={`w-6 h-6 rounded-full border-2 transition-colors ${color === c ? 'border-white' : 'border-transparent'}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>

          <div>
            <label className="text-[10px] text-[#4B5A7A] mb-1 block">Context for AI</label>
            <textarea value={context} onChange={e => setContext(e.target.value)}
              placeholder="Describe this group: who is in it, what issues to watch for..."
              className="w-full bg-[#080E1C] border border-[#1A2035] rounded-lg px-3 py-2 text-sm text-[#E8EEF8] resize-none focus:outline-none focus:border-[#F2784B]/50" rows={3} />
          </div>

          <div className="flex gap-2 pt-2">
            <button onClick={onClose}
              className="flex-1 h-9 rounded-lg text-xs text-[#4B5A7A] hover:bg-[#111D30] transition-colors">
              Cancel
            </button>
            <button onClick={handleSubmit} disabled={submitting}
              className="flex-1 h-9 rounded-lg bg-[#F2784B] text-white text-xs font-medium hover:bg-[#E0673D] transition-colors disabled:opacity-50">
              {submitting ? 'Adding...' : 'Add Group'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}

const AGENT_COLORS: Record<string, string> = {
  ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2',
}
