'use client'

import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import { CheckCircle, XCircle, RefreshCw, Send, Scan } from 'lucide-react'

const OAUTH_URL = `https://open.larksuite.com/open-apis/authen/v1/authorize?app_id=cli_a95beb5592f8ded0&redirect_uri=${encodeURIComponent('https://belive-nucleus.vercel.app/api/auth/lark/callback')}&scope=im:message%20im:message.send_as_user%20im:chat%20im:chat.members:read&response_type=code&state=nucleus`

type TokenStatus = {
  connected: boolean
  expiresAt: string | null
  needsRefresh: boolean
}

type ScanResult = {
  scannedAt: string
  clusters: Record<string, { newMessages: number; issues: number }>
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="text-[#4B5A7A] text-sm p-4">Loading settings...</div>}>
      <SettingsContent />
    </Suspense>
  )
}

function SettingsContent() {
  const searchParams = useSearchParams()
  const [status, setStatus] = useState<TokenStatus | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<ScanResult | null>(null)
  const [sendingBriefing, setSendingBriefing] = useState(false)

  useEffect(() => {
    if (searchParams.get('success') === 'true') {
      toast.success('Lark account connected successfully')
    }
    if (searchParams.get('error')) {
      toast.error(`Connection failed: ${searchParams.get('error')}`)
    }

    fetchStatus()
  }, [searchParams])

  async function fetchStatus() {
    try {
      const res = await fetch('/api/lark/status')
      const data = await res.json()
      setStatus(data)
    } catch {
      setStatus({ connected: false, expiresAt: null, needsRefresh: false })
    }
  }

  async function handleScan() {
    setScanning(true)
    try {
      const res = await fetch('/api/lark/scan', {
        method: 'POST',
        headers: { 'x-nucleus-secret': 'belive_nucleus_2026' },
      })
      const data = await res.json()
      if (data.ok) {
        setScanResult(data)
        toast.success('Cluster scan complete')
      } else {
        toast.error(data.error ?? 'Scan failed')
      }
    } catch {
      toast.error('Scan failed')
    } finally {
      setScanning(false)
    }
  }

  async function handleBriefing() {
    setSendingBriefing(true)
    try {
      const res = await fetch('/api/cron', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer belive_cron_2026',
        },
        body: JSON.stringify({ task: 'morning-briefing' }),
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Morning briefings sent')
      } else {
        toast.error(data.error ?? 'Briefing failed')
      }
    } catch {
      toast.error('Briefing failed')
    } finally {
      setSendingBriefing(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Section 1 — Lark Connection */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#E8EEF8] mb-4">Lark Connection</h3>

        {status === null ? (
          <p className="text-xs text-[#4B5A7A]">Loading...</p>
        ) : status.connected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-[#4BF2A2]" />
              <span className="text-sm text-[#4BF2A2]">Connected as Lee Seng Hee</span>
            </div>
            {status.expiresAt && (
              <p className="text-xs text-[#4B5A7A]">
                Token expires: {new Date(status.expiresAt).toLocaleString('en-MY')}
              </p>
            )}
            {status.needsRefresh && (
              <p className="text-xs text-[#E8A838]">Token expiring soon — will auto-refresh</p>
            )}
            <a
              href={OAUTH_URL}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs text-[#8A9BB8] hover:text-[#E8EEF8] hover:bg-[#111D30] transition-colors"
            >
              <RefreshCw size={14} /> Reconnect
            </a>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <XCircle size={16} className="text-[#E05252]" />
              <span className="text-sm text-[#E05252]">Not Connected</span>
            </div>
            <a
              href={OAUTH_URL}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#F2784B] text-white text-sm font-medium hover:bg-[#E0673D] transition-colors"
            >
              Connect Lee&apos;s Lark Account
            </a>
          </div>
        )}
      </div>

      {/* Section 2 — Manual Controls */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#E8EEF8] mb-4">Manual Controls</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleScan}
            disabled={scanning}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111D30] text-sm text-[#E8EEF8] hover:bg-[#162038] transition-colors disabled:opacity-50"
          >
            <Scan size={14} />
            {scanning ? 'Scanning...' : 'Scan Clusters Now'}
          </button>
          <button
            onClick={handleBriefing}
            disabled={sendingBriefing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#111D30] text-sm text-[#E8EEF8] hover:bg-[#162038] transition-colors disabled:opacity-50"
          >
            <Send size={14} />
            {sendingBriefing ? 'Sending...' : 'Send Morning Briefing'}
          </button>
        </div>

        {scanResult && (
          <div className="mt-4 p-3 bg-[#080E1C] rounded-lg border border-[#1A2035]">
            <p className="text-xs text-[#4B5A7A] mb-2">
              Last scan: {new Date(scanResult.scannedAt).toLocaleTimeString('en-MY')}
            </p>
            {Object.entries(scanResult.clusters).map(([cluster, data]) => (
              <div key={cluster} className="flex items-center justify-between py-1">
                <span className="text-xs text-[#8A9BB8]">{cluster}</span>
                <span className="text-xs font-[family-name:var(--font-jetbrains-mono)] text-[#E8EEF8]">
                  {data.newMessages} msgs, {data.issues} issues
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Section 3 — Cluster Status */}
      <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-6">
        <h3 className="text-sm font-medium text-[#E8EEF8] mb-4">Test Clusters</h3>
        <div className="space-y-2">
          {['C1', 'C2', 'C11'].map((cluster) => (
            <div key={cluster} className="flex items-center justify-between py-2 border-b border-[#1A2035]/50 last:border-0">
              <span className="text-sm text-[#E8EEF8]">{cluster}</span>
              <span className="text-xs text-[#4B5A7A]">
                {cluster === 'C1' ? 'Johor Bahru' : cluster === 'C2' ? 'Penang' : 'Cheras (M Vertica)'}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
