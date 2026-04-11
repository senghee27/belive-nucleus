'use client'

import { useEffect, useState } from 'react'

type Row = {
  step: string
  category: string
  stated: number
  actual: number
  gap: number
  sample_size: number
}

const STEP_LABEL: Record<string, string> = {
  matching: 'Matching',
  is_incident: 'Is incident',
  classification: 'Classification',
  priority: 'Priority',
  routing: 'Routing',
  voice_fit: 'Voice fit',
}

export function CalibrationChart() {
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch('/api/reasoning/calibration')
      .then(r => r.json())
      .then(d => { if (!cancelled) setRows((d.calibration ?? []) as Row[]) })
      .catch(() => { if (!cancelled) setRows([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  // Group rows by category for readability
  const byCategory = new Map<string, Row[]>()
  for (const r of rows) {
    const list = byCategory.get(r.category) ?? []
    list.push(r)
    byCategory.set(r.category, list)
  }

  return (
    <section className="mb-6 rounded-lg border border-[#1A2035] bg-[#0D1525] p-4">
      <header className="flex items-center justify-between mb-3">
        <h2 className="text-[12px] font-semibold text-[#E6EAF4]">Calibration</h2>
        <span className="text-[10px] text-[#4B5A7A]">Stated vs actual approval rate · last 30 days</span>
      </header>

      {loading && <div className="text-[11px] text-[#4B5A7A]">Loading calibration…</div>}

      {!loading && rows.length === 0 && (
        <div className="text-[11px] text-[#4B5A7A]">
          No calibration data yet — need at least one finalized proposal revision with matching reasoning trace rows in the last 30 days.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-[11px]">
            <thead>
              <tr className="border-b border-[#1A2035] text-[9px] uppercase tracking-wider text-[#4B5A7A]">
                <th className="p-2 text-left">Category</th>
                <th className="p-2 text-left">Step</th>
                <th className="p-2 text-right">Stated</th>
                <th className="p-2 text-right">Actual</th>
                <th className="p-2 text-right">Gap</th>
                <th className="p-2 text-right">n</th>
              </tr>
            </thead>
            <tbody>
              {[...byCategory.entries()].map(([cat, list]) => (
                list.map((r, idx) => (
                  <tr key={`${cat}-${r.step}`} className="border-b border-[#1A2035]/40">
                    <td className="p-2 text-[#8A9BB8]">{idx === 0 ? cat : ''}</td>
                    <td className="p-2 text-[#D4DAEA]">{STEP_LABEL[r.step] ?? r.step}</td>
                    <td className="p-2 text-right font-[family-name:var(--font-jetbrains-mono)] text-[#B0B8CC]">{r.stated}%</td>
                    <td className="p-2 text-right font-[family-name:var(--font-jetbrains-mono)] text-[#B0B8CC]">{r.actual}%</td>
                    <td
                      className="p-2 text-right font-[family-name:var(--font-jetbrains-mono)]"
                      style={{ color: r.gap > 15 ? '#E05252' : r.gap > 5 ? '#E8A838' : '#4BF2A2' }}
                    >
                      {r.gap > 0 ? '▼' : '▲'}{Math.abs(r.gap)}
                    </td>
                    <td className="p-2 text-right text-[#4B5A7A]">{r.sample_size}</td>
                  </tr>
                ))
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
