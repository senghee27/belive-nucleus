'use client'

import { useEffect, useState } from 'react'

type Stats = { total: number; high: number; low: number; avg: number }

export function ReasoningStats() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/reasoning/stats')
      .then(r => r.json())
      .then(d => { if (!cancelled) setStats(d as Stats) })
      .catch(() => { if (!cancelled) setStats({ total: 0, high: 0, low: 0, avg: 0 }) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const cards: Array<{ label: string; value: string | number; color: string }> = [
    { label: 'Total trace rows', value: stats?.total ?? 0, color: '#E6EAF4' },
    { label: 'High confidence (≥90)', value: stats?.high ?? 0, color: '#4BF2A2' },
    { label: 'Low confidence (<70)', value: stats?.low ?? 0, color: '#E05252' },
    { label: 'Average confidence', value: stats ? `${stats.avg}%` : '—', color: '#F2784B' },
  ]

  return (
    <section className="mb-6 grid grid-cols-2 md:grid-cols-4 gap-3">
      {cards.map(c => (
        <div key={c.label} className="rounded-lg border border-[#1A2035] bg-[#0D1525] p-4">
          <div className="text-[10px] uppercase tracking-wider text-[#4B5A7A]">{c.label}</div>
          <div
            className="font-[family-name:var(--font-jetbrains-mono)] text-[28px] font-semibold mt-1"
            style={{ color: c.color }}
          >
            {loading ? '…' : c.value}
          </div>
        </div>
      ))}
    </section>
  )
}
