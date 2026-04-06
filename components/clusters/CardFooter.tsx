'use client'

import { RotateCw, FileText, ClipboardCheck } from 'lucide-react'
import { useState } from 'react'
import { formatDistanceToNow } from 'date-fns'

export function CardFooter({ lastComputedAt, briefSentToday, standupReportAt, clusterId, onScan }: {
  lastComputedAt: string; briefSentToday: boolean; standupReportAt: string | null; clusterId: string; onScan: (cluster: string) => void
}) {
  const [scanning, setScanning] = useState(false)

  const handleScan = async () => {
    setScanning(true)
    try { await onScan(clusterId) }
    finally { setTimeout(() => setScanning(false), 2000) }
  }

  const scanAge = lastComputedAt ? formatDistanceToNow(new Date(lastComputedAt), { addSuffix: true }) : 'never'

  return (
    <div className="px-3.5 py-1.5 border-t border-[#1A2035] flex items-center justify-between shrink-0">
      <span className="text-[9px] text-[#4B5A7A]">{scanAge}</span>
      <div className="flex items-center gap-2">
        <span title={briefSentToday ? 'Brief sent today' : 'No brief today'}><FileText size={11} className={briefSentToday ? 'text-[#4BF2A2]' : 'text-[#2A3550]'} /></span>
        <span title={standupReportAt ? 'Standup received' : 'No standup'}><ClipboardCheck size={11} className={standupReportAt ? 'text-[#4BF2A2]' : 'text-[#2A3550]'} /></span>
        <button onClick={handleScan} disabled={scanning} className="text-[#4B5A7A] hover:text-[#F2784B] transition-colors disabled:opacity-50">
          <RotateCw size={11} className={scanning ? 'animate-spin' : ''} />
        </button>
      </div>
    </div>
  )
}
