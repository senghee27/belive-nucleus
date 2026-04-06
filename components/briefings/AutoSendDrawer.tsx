'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { REPORT_TYPE_META } from '@/lib/types'
import type { BriefingAutosendConfig } from '@/lib/types'

export function AutoSendDrawer({ onClose }: { onClose: () => void }) {
  const [configs, setConfigs] = useState<BriefingAutosendConfig[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/briefings/autosend')
      .then(r => r.json())
      .then(d => { if (d.ok) setConfigs(d.configs) })
      .finally(() => setLoading(false))
  }, [])

  const handleToggle = async (reportType: string, currentEnabled: boolean) => {
    const config = configs.find(c => c.report_type === reportType)
    if (!config) return

    // If enabling and not eligible — confirm
    if (!currentEnabled && !config.auto_send_eligible) {
      const ok = window.confirm(`You have only ${config.consecutive_approvals} approvals. Enable auto-send anyway?`)
      if (!ok) return
    }

    try {
      await fetch('/api/briefings/autosend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: reportType, auto_send_enabled: !currentEnabled }),
      })
      setConfigs(prev => prev.map(c =>
        c.report_type === reportType ? { ...c, auto_send_enabled: !currentEnabled } : c
      ))
      toast.success(`Auto-send ${!currentEnabled ? 'enabled' : 'disabled'} for ${REPORT_TYPE_META[reportType]?.label ?? reportType}`)
    } catch { toast.error('Failed to update') }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative w-[400px] max-w-full h-full bg-[#0D1525] border-l border-[#1A2035] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#1A2035]">
          <h3 className="text-sm font-semibold text-[#E8EEF8]">Auto-Send Settings</h3>
          <button onClick={onClose} className="text-[#4B5A7A] hover:text-[#E8EEF8] transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-4">
          <p className="text-[11px] text-[#4B5A7A] mb-4">
            Once a report type is sent consistently, you can enable auto-send. Nucleus will generate and send without waiting for your review. You can toggle auto-send off at any time.
          </p>

          {loading ? (
            <div className="text-center py-8 text-[#4B5A7A] text-xs">Loading...</div>
          ) : (
            <div className="space-y-3">
              {configs.map(c => {
                const meta = REPORT_TYPE_META[c.report_type] ?? { icon: '📄', label: c.report_type }
                const required = c.required_consecutive_approvals
                const progress = Math.min(c.consecutive_approvals, required)
                const pct = Math.round((progress / required) * 100)
                const barColor = progress >= required ? '#4BF2A2' : progress >= required * 0.5 ? '#E8A838' : '#2A3550'

                return (
                  <div key={c.report_type} className="bg-[#080E1C] rounded-lg p-3 border border-[#1A2035]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm">{meta.icon}</span>
                      <span className="text-xs font-medium text-[#E8EEF8] flex-1">{meta.label}</span>
                      <button onClick={() => handleToggle(c.report_type, c.auto_send_enabled)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-bold transition-colors ${
                          c.auto_send_enabled
                            ? 'bg-[#4BF2A2]/20 text-[#4BF2A2]'
                            : 'bg-[#1A2035] text-[#4B5A7A] hover:text-[#8A9BB8]'
                        }`}>
                        {c.auto_send_enabled ? '● ON' : 'OFF ▶'}
                      </button>
                    </div>

                    {/* Confidence meter */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] text-[#4B5A7A]">Confidence:</span>
                      <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: barColor }} />
                      </div>
                      <span className="text-[10px] text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">
                        {progress}/{required}
                      </span>
                    </div>

                    {/* Status text */}
                    <p className="text-[9px] text-[#4B5A7A]">
                      {c.auto_send_enabled
                        ? `Sending automatically${c.last_sent_at ? ` since ${new Date(c.last_sent_at).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`
                        : c.auto_send_eligible
                        ? 'Eligible! Toggle on when ready.'
                        : `${required - progress} more approval${required - progress !== 1 ? 's' : ''} needed`
                      }
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
