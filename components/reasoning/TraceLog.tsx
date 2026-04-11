'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { PillFilter } from './ConfidenceFilter'
import type { ReasoningStepName } from '@/lib/types'

type TraceJoinRow = {
  id: string
  incident_id: string
  step_name: ReasoningStepName
  decision: string
  confidence: number
  reasoning_text: string
  created_at: string
  incidents: {
    id: string
    title: string
    cluster: string | null
    category: string | null
    severity: string | null
    priority: string | null
    created_at: string
  } | null
}

const STEP_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'matching', label: 'Matching' },
  { value: 'is_incident', label: 'Is incident' },
  { value: 'classification', label: 'Classification' },
  { value: 'priority', label: 'Priority' },
  { value: 'routing', label: 'Routing' },
  { value: 'voice_fit', label: 'Voice fit' },
]

const BAND_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'low', label: '<70' },
  { value: 'mid', label: '70-89' },
  { value: 'high', label: '90+' },
]

export function TraceLog() {
  const [rows, setRows] = useState<TraceJoinRow[]>([])
  const [loading, setLoading] = useState(true)
  const [step, setStep] = useState('')
  const [band, setBand] = useState('')
  const [category, setCategory] = useState('')
  const [cluster, setCluster] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const params = new URLSearchParams()
    if (step) params.set('step', step)
    if (band) params.set('band', band)
    if (category) params.set('category', category)
    if (cluster) params.set('cluster', cluster)
    params.set('limit', '100')
    fetch(`/api/reasoning?${params.toString()}`)
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows((d.traces ?? []) as TraceJoinRow[]) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [step, band, category, cluster])

  const categoryOptions = [
    { value: '', label: 'All categories' },
    ...Array.from(new Set(rows.map(r => r.incidents?.category).filter(Boolean)))
      .slice(0, 10)
      .map(c => ({ value: c as string, label: c as string })),
  ]

  const clusterOptions = [
    { value: '', label: 'All clusters' },
    ...Array.from(new Set(rows.map(r => r.incidents?.cluster).filter(Boolean)))
      .slice(0, 11)
      .map(c => ({ value: c as string, label: c as string })),
  ]

  return (
    <section className="rounded-lg border border-[#1A2035] bg-[#0D1525] p-4">
      <header className="mb-3 flex items-center justify-between">
        <h2 className="text-[12px] font-semibold text-[#E6EAF4]">Trace log</h2>
        <span className="text-[10px] text-[#4B5A7A]">{rows.length} rows · worst-first</span>
      </header>

      <div className="flex flex-col gap-2 mb-4">
        <PillFilter label="Step" value={step} options={STEP_OPTIONS} onChange={setStep} />
        <PillFilter label="Band" value={band} options={BAND_OPTIONS} onChange={setBand} />
        <PillFilter label="Category" value={category} options={categoryOptions} onChange={setCategory} />
        <PillFilter label="Cluster" value={cluster} options={clusterOptions} onChange={setCluster} />
      </div>

      {loading && <div className="text-[11px] text-[#4B5A7A]">Loading…</div>}

      {!loading && rows.length === 0 && (
        <div className="text-[11px] text-[#4B5A7A]">No trace rows match these filters.</div>
      )}

      <ul className="divide-y divide-[#1A2035]">
        {rows.map(r => {
          const conf = r.confidence
          const color = conf < 70 ? '#E05252' : conf < 90 ? '#E8A838' : '#4BF2A2'
          const href = `/command/${r.incident_id}?expandStep=${r.step_name}`
          return (
            <li key={r.id}>
              <Link
                href={href}
                className="block py-2 hover:bg-[#0F1828] transition-colors px-2 -mx-2 rounded"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-[9px] uppercase text-[#4B5A7A] font-[family-name:var(--font-jetbrains-mono)]">
                        {r.incidents?.cluster ?? '—'}
                      </span>
                      <span className="text-[#D4DAEA] truncate">{r.incidents?.title ?? r.incident_id}</span>
                    </div>
                    <div className="text-[10px] text-[#8A9BB8] mt-0.5 truncate">
                      <span className="text-[#4B5A7A]">{r.step_name}</span> · {r.reasoning_text}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px]" style={{ color }}>
                      {conf}%
                    </span>
                    <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#4B5A7A] max-w-[100px] truncate" title={r.decision}>
                      {r.decision}
                    </span>
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
