'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import { BottomSheet } from '@/components/mobile/BottomSheet'
import { REPORT_TYPE_META } from '@/lib/types'
import type { BriefingReport } from '@/lib/types'

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  draft: { bg: '#E8A838', text: '#E8A838', label: 'DRAFT' },
  sent: { bg: '#4BF2A2', text: '#4BF2A2', label: 'SENT ✓' },
  failed: { bg: '#E05252', text: '#E05252', label: 'FAILED' },
}

export default function ReportsPage() {
  const [reports, setReports] = useState<BriefingReport[]>([])
  const [loading, setLoading] = useState(true)
  const [readReport, setReadReport] = useState<BriefingReport | null>(null)
  const [sending, setSending] = useState(false)

  const fetchReports = useCallback(async () => {
    const res = await fetch('/api/briefings?limit=30')
    const d = await res.json()
    if (d.ok) setReports(d.reports)
    setLoading(false)
  }, [])

  useEffect(() => { fetchReports() }, [fetchReports])

  const drafts = reports.filter(r => r.status === 'draft')
  const sentToday = reports.filter(r => r.status === 'sent')

  const handleSend = async (id: string) => {
    setSending(true)
    try {
      const res = await fetch(`/api/briefings/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      const d = await res.json()
      toast[d.success ? 'success' : 'error'](d.success ? 'Report sent' : 'Send failed')
      setReadReport(null)
      fetchReports()
    } catch { toast.error('Send failed') }
    finally { setSending(false) }
  }

  const handleSendAll = async () => {
    if (drafts.length === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/briefings/send-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_ids: drafts.map(r => r.id) }),
      })
      const d = await res.json()
      const sent = d.results?.filter((r: { success: boolean }) => r.success).length ?? 0
      toast.success(`Sent ${sent}/${drafts.length} reports`)
      fetchReports()
    } catch { toast.error('Batch send failed') }
    finally { setSending(false) }
  }

  const handleDiscard = async (id: string) => {
    await fetch(`/api/briefings/${id}`, { method: 'DELETE' })
    setReadReport(null)
    fetchReports()
    toast.success('Discarded')
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-[13px] text-[#4B5A7A]">Loading...</div>

  return (
    <div className="px-4 py-4">
      <p className="text-[17px] font-semibold text-[#E8EEF8] mb-3">Reports</p>

      {/* Drafts count + send all */}
      {drafts.length > 0 && (
        <div className="mb-4">
          <p className="text-[13px] text-[#E8A838] mb-2">{drafts.length} draft{drafts.length !== 1 ? 's' : ''} ready</p>
          <button onClick={handleSendAll} disabled={sending}
            className="w-full h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold disabled:opacity-50">
            📤 Send All Drafts ({drafts.length})
          </button>
        </div>
      )}

      {/* Drafts */}
      {drafts.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-[#E8A838] uppercase tracking-wider font-bold">Drafts</span>
            <span className="flex-1 h-px bg-[#E8A838]/20" />
          </div>
          <div className="space-y-2.5 mb-5">
            {drafts.map(r => <ReportCard key={r.id} report={r} onRead={() => setReadReport(r)} onSend={() => handleSend(r.id)} onDiscard={() => handleDiscard(r.id)} />)}
          </div>
        </>
      )}

      {/* Sent */}
      {sentToday.length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-[11px] text-[#4BF2A2] uppercase tracking-wider font-bold">Sent</span>
            <span className="flex-1 h-px bg-[#4BF2A2]/20" />
          </div>
          <div className="space-y-2.5">
            {sentToday.map(r => <ReportCard key={r.id} report={r} onRead={() => setReadReport(r)} />)}
          </div>
        </>
      )}

      {reports.length === 0 && (
        <div className="text-center py-16">
          <p className="text-[15px] text-[#4B5A7A]">No reports yet</p>
        </div>
      )}

      {/* Report reader sheet */}
      <BottomSheet isOpen={!!readReport} onClose={() => setReadReport(null)} height="95vh">
        {readReport && (
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b border-[#1A2035] shrink-0">
              <div className="flex items-center gap-2">
                <span>{REPORT_TYPE_META[readReport.report_type]?.icon ?? '📄'}</span>
                <span className="text-[13px] font-semibold text-[#E8EEF8]">{readReport.report_name}</span>
              </div>
              {readReport.status === 'draft' && (
                <button onClick={() => handleSend(readReport.id)} disabled={sending}
                  className="px-3 py-1.5 rounded-[8px] bg-[#F2784B] text-white text-[12px] font-medium disabled:opacity-50">
                  ✓ Send
                </button>
              )}
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <pre className="text-[15px] text-[#E8EEF8] whitespace-pre-wrap leading-relaxed font-[family-name:var(--font-dm-sans)]">
                {readReport.content}
              </pre>
            </div>
            {readReport.status === 'draft' && (
              <div className="flex gap-2 p-4 border-t border-[#1A2035] shrink-0">
                <button onClick={() => setReadReport(null)} className="flex-1 h-11 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">Cancel</button>
                <button onClick={() => handleSend(readReport.id)} disabled={sending}
                  className="flex-1 h-11 rounded-[10px] bg-[#F2784B] text-white text-[14px] font-semibold disabled:opacity-50">
                  ✓ Send Now
                </button>
              </div>
            )}
          </div>
        )}
      </BottomSheet>
    </div>
  )
}

function ReportCard({ report: r, onRead, onSend, onDiscard }: {
  report: BriefingReport; onRead: () => void; onSend?: () => void; onDiscard?: () => void
}) {
  const meta = REPORT_TYPE_META[r.report_type] ?? { icon: '📄', label: r.report_type }
  const status = STATUS_COLORS[r.status] ?? STATUS_COLORS.draft
  const borderColor = status.bg
  const time = new Date(r.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })

  return (
    <div className="bg-[#0D1525] border rounded-[14px] p-4"
      style={{ borderColor: borderColor + '50', borderLeftWidth: 4, borderLeftColor: borderColor }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-2">
          <span>{meta.icon}</span>
          <span className="text-[13px] font-semibold text-[#E8EEF8]">{r.report_name}</span>
        </div>
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ color: status.text, backgroundColor: status.bg + '20' }}>{status.label}</span>
      </div>
      <p className="text-[12px] text-[#4B5A7A] mb-3">Generated {time}{r.cluster ? ` · ${r.cluster}` : ''}</p>
      <div className="flex gap-2">
        <button onClick={onRead} className="flex-1 h-10 rounded-[10px] bg-[#111D30] text-[13px] text-[#8A9BB8]">👁 Read</button>
        {onSend && r.status === 'draft' && (
          <button onClick={onSend} className="flex-1 h-10 rounded-[10px] bg-[#F2784B] text-white text-[13px] font-medium">✓ Send</button>
        )}
        {onDiscard && r.status === 'draft' && (
          <button onClick={onDiscard} className="w-10 h-10 rounded-[10px] bg-[#111D30] text-[13px] text-[#4B5A7A]">✗</button>
        )}
      </div>
    </div>
  )
}
