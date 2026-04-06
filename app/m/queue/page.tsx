'use client'

import { useState, useEffect } from 'react'
import { QueueSwiper } from '@/components/mobile/QueueSwiper'
import type { Incident } from '@/lib/types'

export default function QueuePage() {
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/m/queue')
      .then(r => r.json())
      .then(d => { if (d.ok) setIncidents(d.incidents) })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-[13px] text-[#4B5A7A]">Loading queue...</div>
  }

  if (incidents.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <span className="text-4xl mb-3">✅</span>
        <p className="text-[17px] font-semibold text-[#E8EEF8]">Queue cleared!</p>
        <p className="text-[13px] text-[#4B5A7A] mt-1">Nothing waiting for your decision.</p>
      </div>
    )
  }

  return <QueueSwiper incidents={incidents} />
}
