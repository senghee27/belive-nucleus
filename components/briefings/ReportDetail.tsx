'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Send, Pencil, Trash2, RotateCcw, ChevronDown, ChevronUp, Check, X, AlertCircle, User, Users } from 'lucide-react'
import { toast } from 'sonner'
import { REPORT_TYPE_META } from '@/lib/types'
import type { BriefingReport, BriefingDestination, BriefingGenerationLog } from '@/lib/types'

type ResolvedDestination = BriefingDestination & {
  display_name?: string
  description?: string
  icon?: string
}

const STATUS_COLORS: Record<string, string> = {
  draft: '#E8A838', sent: '#4BF2A2', failed: '#E05252', discarded: '#4B5A7A', pending_review: '#4BB8F2', approved: '#4BF2A2',
}

export function ReportDetail({ reportId }: { reportId: string }) {
  const router = useRouter()
  const [report, setReport] = useState<BriefingReport | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [sending, setSending] = useState(false)
  const [showLog, setShowLog] = useState(false)

  const fetchReport = async () => {
    try {
      const res = await fetch(`/api/briefings/${reportId}`)
      const data = await res.json()
      if (data.ok) setReport(data.report as BriefingReport)
    } catch { toast.error('Failed to load report') }
    finally { setLoading(false) }
  }

  useEffect(() => { fetchReport() }, [reportId])

  const handleEdit = () => {
    if (!report) return
    setEditContent(report.content)
    setEditing(true)
  }

  const handleSave = async () => {
    if (!report) return
    setSaving(true)
    try {
      const res = await fetch(`/api/briefings/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      const data = await res.json()
      if (data.ok) {
        setReport(data.report as BriefingReport)
        setEditing(false)
        toast.success('Changes saved')
      }
    } catch { toast.error('Save failed') }
    finally { setSaving(false) }
  }

  const handleReset = async () => {
    if (!report) return
    try {
      await fetch(`/api/briefings/${report.id}/reset`, { method: 'POST' })
      await fetchReport()
      toast.success('Reset to original')
    } catch { toast.error('Reset failed') }
  }

  const handleSend = async () => {
    if (!report) return
    setSending(true)
    try {
      const res = await fetch(`/api/briefings/${report.id}/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      })
      const data = await res.json()
      toast[data.success ? 'success' : 'error'](data.success ? 'Report sent!' : `Send failed: ${data.error ?? 'Unknown'}`)
      await fetchReport()
    } catch { toast.error('Send failed') }
    finally { setSending(false) }
  }

  const handleDiscard = async () => {
    if (!report || !window.confirm('Discard this report?')) return
    try {
      await fetch(`/api/briefings/${report.id}`, { method: 'DELETE' })
      toast.success('Report discarded')
      router.push('/briefings')
    } catch { toast.error('Discard failed') }
  }

  const toggleDestination = async (chatId: string) => {
    if (!report) return
    const updated = report.destinations.map(d =>
      d.chat_id === chatId ? { ...d, selected: !d.selected } : d
    )
    setReport({ ...report, destinations: updated })
    // Persist
    await fetch(`/api/briefings/${report.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: report.content }), // no-op content to trigger update
    }).catch(() => {})
  }

  if (loading) {
    return <div className="flex items-center justify-center h-64 text-[#4B5A7A] text-sm">Loading...</div>
  }

  if (!report) {
    return <div className="flex items-center justify-center h-64 text-[#E05252] text-sm">Report not found</div>
  }

  const meta = REPORT_TYPE_META[report.report_type] ?? { icon: '📄', label: report.report_type }
  const log = report.generation_log as BriefingGenerationLog
  const statusColor = STATUS_COLORS[report.status] ?? '#4B5A7A'

  // Destination helpers
  const selectedDests = (report.destinations as ResolvedDestination[]).filter(d => d.selected)
  const selectedDestCount = selectedDests.length
  const sendButtonLabel = (() => {
    if (selectedDestCount === 0) return 'Send Now'
    const names = selectedDests.map(d => {
      const n = d.display_name ?? d.name
      return (n.startsWith('ou_') || n.startsWith('oc_')) ? 'Unknown' : n
    })
    if (selectedDestCount === 1) return `Send to ${names[0]}`
    if (selectedDestCount === 2) return `Send to ${names[0]} + ${names[1]}`
    return `Send to ${selectedDestCount} destinations`
  })()

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[#1A2035]">
        <button onClick={() => router.push('/briefings')} className="flex items-center gap-1 text-xs text-[#4B5A7A] hover:text-[#8A9BB8] mb-2 transition-colors">
          <ArrowLeft size={12} /> Back to Briefings
        </button>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{meta.icon}</span>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-[#E8EEF8]">{report.report_name}</h1>
            <p className="text-[11px] text-[#4B5A7A]">
              {new Date(report.created_at).toLocaleDateString('en-MY', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })}
              {' · '}
              {new Date(report.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
              {log?.duration_seconds ? ` · Generated in ${log.duration_seconds}s` : ''}
            </p>
          </div>
          <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ color: statusColor, backgroundColor: `${statusColor}15` }}>
            {report.status.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Destinations */}
        <div className="bg-[#0D1525] rounded-lg border border-[#1A2035]">
          <div className="px-3 py-2 border-b border-[#1A2035]">
            <h3 className="text-xs font-semibold text-[#8A9BB8]">SEND TO</h3>
          </div>
          <div className="divide-y divide-[#1A2035]">
            {(report.destinations as ResolvedDestination[]).map((d) => {
              const displayName = d.display_name ?? d.name
              const isRawId = displayName.startsWith('ou_') || displayName.startsWith('oc_')
              const shownName = isRawId ? 'Unknown' : displayName
              const desc = d.description ?? (d.type === 'lee_dm' ? 'Personal DM' : 'Group chat')
              const isDisabled = report.status === 'sent' || report.status === 'discarded'
              const typeBadge = d.type === 'lee_dm' ? 'DM' : d.type === 'cluster_group' ? 'CLUSTER' : d.type === 'ai_report' ? 'AI REPORT' : 'GROUP'
              const badgeColor = d.type === 'lee_dm' ? '#9B6DFF' : d.type === 'cluster_group' ? '#4BB8F2' : d.type === 'ai_report' ? '#E8A838' : '#4B5A7A'

              return (
                <div key={d.chat_id}
                  onClick={() => { if (!isDisabled) toggleDestination(d.chat_id) }}
                  className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${isDisabled ? 'opacity-60' : 'cursor-pointer hover:bg-[#111D30]'}`}>
                  <input type="checkbox" checked={d.selected}
                    onChange={() => {}}
                    disabled={isDisabled}
                    className="w-4 h-4 rounded border-[#2A3550] accent-[#F2784B] shrink-0" />
                  <span className="w-7 h-7 rounded-full bg-[#111D30] flex items-center justify-center shrink-0">
                    {d.icon === 'user' || d.type === 'lee_dm' ? <User size={14} className="text-[#9B6DFF]" /> : <Users size={14} className="text-[#4BB8F2]" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-[#E8EEF8] block truncate" title={d.chat_id}>
                      {shownName}
                    </span>
                    <span className="text-[10px] text-[#4B5A7A]">{desc}</span>
                  </div>
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider shrink-0"
                    style={{ color: badgeColor, backgroundColor: `${badgeColor}15` }}>
                    {typeBadge}
                  </span>
                </div>
              )
            })}
            {report.destinations.length === 0 && (
              <p className="text-[11px] text-[#4B5A7A] p-3">No destinations configured</p>
            )}
          </div>
          {/* Selected count */}
          <div className="px-3 py-2 border-t border-[#1A2035]">
            {selectedDestCount > 0 ? (
              <p className="text-[10px] text-[#8A9BB8]">{selectedDestCount} destination{selectedDestCount !== 1 ? 's' : ''} selected</p>
            ) : (
              <p className="text-[10px] text-[#E8A838]">⚠️ No destinations selected — report will not be sent anywhere</p>
            )}
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-[#0D1525] rounded-lg border border-[#1A2035]">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[#1A2035]">
            <h3 className="text-xs font-semibold text-[#8A9BB8]">REPORT CONTENT</h3>
            <div className="flex items-center gap-1.5">
              {!editing && report.status !== 'sent' && report.status !== 'discarded' && (
                <button onClick={handleEdit} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#4BB8F2] hover:bg-[#4BB8F2]/10 transition-colors">
                  <Pencil size={10} /> Edit
                </button>
              )}
              {report.lee_edited && (
                <button onClick={handleReset} className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] text-[#E8A838] hover:bg-[#E8A838]/10 transition-colors">
                  <RotateCcw size={10} /> Reset
                </button>
              )}
            </div>
          </div>
          <div className="p-3">
            {editing ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="w-full min-h-[300px] bg-[#080E1C] border border-[#1A2035] rounded-lg p-3 text-xs text-[#E8EEF8] font-[family-name:var(--font-jetbrains-mono)] resize-y focus:outline-none focus:border-[#F2784B]/50"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[9px] text-[#4B5A7A]">{editContent.length} characters</span>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setEditing(false)} className="flex items-center gap-1 px-2.5 py-1 rounded text-[10px] text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
                      <X size={10} /> Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving}
                      className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#F2784B]/10 text-[#F2784B] text-[10px] font-medium hover:bg-[#F2784B]/20 transition-colors disabled:opacity-50">
                      <Check size={10} /> {saving ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <pre className="text-xs text-[#E8EEF8] whitespace-pre-wrap font-[family-name:var(--font-jetbrains-mono)] leading-relaxed">
                {report.content}
              </pre>
            )}
          </div>
          {report.lee_edited && !editing && (
            <div className="px-3 pb-2">
              <p className="text-[9px] text-[#E8A838]">✏️ Lee edited this report (original preserved · Reset available)</p>
            </div>
          )}
        </div>

        {/* Generation Log */}
        <div className="bg-[#0D1525] rounded-lg border border-[#1A2035]">
          <button onClick={() => setShowLog(!showLog)}
            className="flex items-center justify-between w-full px-3 py-2 text-left">
            <h3 className="text-xs font-semibold text-[#8A9BB8]">GENERATION LOG</h3>
            {showLog ? <ChevronUp size={12} className="text-[#4B5A7A]" /> : <ChevronDown size={12} className="text-[#4B5A7A]" />}
          </button>
          {showLog && log && (
            <div className="px-3 pb-3 space-y-3 border-t border-[#1A2035] pt-2">
              {/* Sources */}
              <div>
                <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider mb-1">Data Sources</p>
                {log.sources_read?.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5 text-[11px]">
                    <span className={s.success ? 'text-[#4BF2A2]' : 'text-[#E05252]'}>{s.success ? '✓' : '✗'}</span>
                    <span className="text-[#E8EEF8]">{s.name}</span>
                    <span className="text-[#4B5A7A]">· {s.record_count} records · {new Date(s.scanned_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
              </div>

              {/* AI Reasoning */}
              {log.ai_reasoning && (
                <div>
                  <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider mb-1">AI Reasoning</p>
                  <p className="text-[11px] text-[#8A9BB8] italic">&ldquo;{log.ai_reasoning}&rdquo;</p>
                </div>
              )}

              {/* Processing */}
              <div>
                <p className="text-[10px] text-[#4B5A7A] uppercase tracking-wider mb-1">Processing</p>
                <p className="text-[11px] text-[#8A9BB8]">
                  {log.processing_start && `Started: ${new Date(log.processing_start).toLocaleTimeString('en-MY')}`}
                  {log.duration_seconds ? ` · ${log.duration_seconds}s` : ''}
                  {log.tokens_used ? ` · ${log.tokens_used.toLocaleString()} tokens` : ''}
                  {log.model ? ` · ${log.model}` : ''}
                </p>
              </div>

              {/* Errors */}
              {log.errors?.length > 0 && (
                <div>
                  <p className="text-[10px] text-[#E05252] uppercase tracking-wider mb-1">Errors</p>
                  {log.errors.map((e, i) => (
                    <p key={i} className="text-[11px] text-[#E05252] flex items-center gap-1">
                      <AlertCircle size={10} /> {e}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Send results */}
        {report.sent_to && (report.sent_to as { chat_id: string; name: string; success: boolean; error?: string }[]).length > 0 && (
          <div className="bg-[#0D1525] rounded-lg p-3 border border-[#1A2035]">
            <h3 className="text-xs font-semibold text-[#8A9BB8] mb-2">SEND RESULTS</h3>
            {(report.sent_to as { chat_id: string; name: string; success: boolean; error?: string }[]).map((r, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[11px]">
                <span className={r.success ? 'text-[#4BF2A2]' : 'text-[#E05252]'}>{r.success ? '✓' : '✗'}</span>
                <span className="text-[#E8EEF8]">{r.name}</span>
                {r.error && <span className="text-[#E05252]">— {r.error}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Sticky Footer Actions */}
      {report.status !== 'discarded' && (
        <div className="flex items-center gap-2 px-6 py-3 border-t border-[#1A2035] bg-[#0D1525]">
          {(report.status === 'draft' || report.status === 'failed') && (
            <button onClick={handleSend} disabled={sending || selectedDestCount === 0}
              className={`flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                selectedDestCount === 0
                  ? 'bg-[#1A2035] text-[#4B5A7A] cursor-not-allowed'
                  : 'bg-[#F2784B] text-white hover:bg-[#F2784B]/90'
              } disabled:opacity-50`}>
              <Send size={13} /> {sending ? 'Sending...' : sendButtonLabel}
            </button>
          )}
          {report.status === 'draft' && !editing && (
            <button onClick={handleEdit}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg bg-[#111D30] text-[#8A9BB8] text-xs hover:bg-[#1A2035] transition-colors">
              <Pencil size={12} /> Edit
            </button>
          )}
          {report.status !== 'sent' && (
            <button onClick={handleDiscard}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-[#E05252] text-xs hover:bg-[#E05252]/10 transition-colors">
              <Trash2 size={12} /> Discard
            </button>
          )}
        </div>
      )}
    </div>
  )
}
