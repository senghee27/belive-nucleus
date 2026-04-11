'use client'

import { useState, useEffect } from 'react'
import { StepRow } from '@/components/reasoning/StepRow'
import type { ReasoningTrace, ReasoningStepName } from '@/lib/types'

interface ReasoningPanelProps {
  incidentId: string
  initialExpandedStep?: ReasoningStepName | null
}

export function ReasoningPanel({ incidentId, initialExpandedStep = null }: ReasoningPanelProps) {
  const [traces, setTraces] = useState<ReasoningTrace[]>([])
  const [expandedStep, setExpandedStep] = useState<ReasoningStepName | null>(initialExpandedStep)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    fetch(`/api/incidents/${incidentId}/reasoning`)
      .then(r => r.json())
      .then(d => {
        if (!cancelled) setTraces((d.traces ?? []) as ReasoningTrace[])
      })
      .catch(() => { if (!cancelled) setTraces([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [incidentId])

  useEffect(() => {
    if (initialExpandedStep) setExpandedStep(initialExpandedStep)
  }, [initialExpandedStep])

  const minConf = traces.length > 0 ? Math.min(...traces.map(t => t.confidence)) : 100
  const minConfColor = minConf < 70 ? '#E05252' : minConf < 90 ? '#E8A838' : '#4BF2A2'

  return (
    <section className="rounded-lg border border-[#1A2035] bg-[#0D1525] p-3">
      <header className="flex items-center justify-between border-b border-[#1A2035] pb-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-wider text-[#9B6DFF]">
            Reasoning Trace
          </span>
          <span className="text-[9px] text-[#4B5A7A]">v1 original</span>
        </div>
        {traces.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] text-[#4B5A7A] uppercase">min</span>
            <span className="font-[family-name:var(--font-jetbrains-mono)] text-[11px]" style={{ color: minConfColor }}>
              {minConf}%
            </span>
            {minConf < 70 && <span className="text-[#E05252] text-[10px]" aria-label="low confidence warning">⚠</span>}
          </div>
        )}
      </header>

      {loading && <div className="text-[10px] text-[#4B5A7A] py-1">Loading trace…</div>}

      {!loading && traces.length === 0 && (
        <div className="text-[10px] text-[#4B5A7A] py-1">
          No reasoning trace recorded for this incident.
        </div>
      )}

      {!loading && traces.map(t => (
        <StepRow
          key={t.step_name}
          trace={t}
          expanded={expandedStep === t.step_name}
          onToggle={() => setExpandedStep(expandedStep === t.step_name ? null : t.step_name)}
          incidentId={incidentId}
        />
      ))}

      {traces.length > 0 && (
        <footer className="mt-2 pt-2 border-t border-[#1A2035] text-[9px] text-[#4B5A7A]">
          Reasoning is for the original classification, not the current proposal revision.
        </footer>
      )}
    </section>
  )
}
