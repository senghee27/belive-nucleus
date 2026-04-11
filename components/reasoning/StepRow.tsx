'use client'

import { useState } from 'react'
import type { ReasoningTrace, ReasoningStepName } from '@/lib/types'

const STEP_LABELS: Record<ReasoningStepName, string> = {
  matching: '1. Matching',
  is_incident: '2. Is incident',
  classification: '3. Classification',
  priority: '4. Priority',
  routing: '5. Routing',
  voice_fit: '6. Voice fit',
}

const TAG_MAP: Record<ReasoningStepName, string> = {
  matching: 'wrong_matching',
  is_incident: 'wrong_classification',
  classification: 'wrong_classification',
  priority: 'wrong_priority',
  routing: 'wrong_routing',
  voice_fit: 'wrong_voice_fit',
}

interface StepRowProps {
  trace: ReasoningTrace
  expanded: boolean
  onToggle: () => void
  incidentId: string
}

export function StepRow({ trace, expanded, onToggle, incidentId }: StepRowProps) {
  const [narrative, setNarrative] = useState<string>(trace.narrative_text ?? '')
  const [loadingNarrative, setLoadingNarrative] = useState(false)
  const [showNarrative, setShowNarrative] = useState(false)
  const [tagSubmitted, setTagSubmitted] = useState(false)
  const [tagError, setTagError] = useState<string | null>(null)

  const confColor = trace.confidence < 70 ? '#E05252' : trace.confidence < 90 ? '#E8A838' : '#4BF2A2'
  const lowConf = trace.confidence < 70

  async function fetchNarrative() {
    if (narrative) {
      setShowNarrative(!showNarrative)
      return
    }
    setLoadingNarrative(true)
    try {
      const r = await fetch(`/api/incidents/${incidentId}/reasoning/narrative`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step: trace.step_name }),
      })
      const d = await r.json()
      if (d.narrative) {
        setNarrative(d.narrative as string)
        setShowNarrative(true)
      }
    } catch {
      // swallow — button stays clickable
    } finally {
      setLoadingNarrative(false)
    }
  }

  async function submitWrongTag() {
    if (tagSubmitted) return
    const tag = TAG_MAP[trace.step_name]
    try {
      const r = await fetch(`/api/incidents/${incidentId}/reasoning/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tags: [tag] }),
      })
      if (r.ok) {
        setTagSubmitted(true)
        setTagError(null)
      } else {
        const d = await r.json().catch(() => ({ error: 'Failed' }))
        setTagError(d.error ?? 'Failed')
      }
    } catch {
      setTagError('Network error')
    }
  }

  return (
    <div className="border-b border-[#151E35] last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-1.5 text-left hover:bg-[#0F1828] transition-colors rounded px-1"
      >
        <div className="flex items-center gap-1.5">
          <span className="text-[#4B5A7A] text-[9px] w-2">{expanded ? '▾' : '▸'}</span>
          <span className="text-[10px] text-[#D4DAEA]">{STEP_LABELS[trace.step_name]}</span>
          {lowConf && <span className="text-[#E05252] text-[9px]">⚠</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px]" style={{ color: confColor }}>
            {trace.confidence}%
          </span>
          <span className="font-[family-name:var(--font-jetbrains-mono)] text-[9px] text-[#8A9BB8] max-w-[90px] truncate" title={trace.decision}>
            {trace.decision}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="pb-2 pl-4 pr-1">
          <div className="rounded border border-[#151E35] bg-[#080E1C] p-2">
            <p className="text-[10px] leading-relaxed text-[#B0B8CC] whitespace-pre-wrap">
              {showNarrative && narrative ? narrative : trace.reasoning_text}
            </p>
            <div className="mt-2 flex gap-3 items-center">
              <button
                type="button"
                onClick={fetchNarrative}
                disabled={loadingNarrative}
                className="text-[9px] uppercase tracking-wide text-[#F2784B] hover:text-[#FF8C5C] disabled:opacity-50"
              >
                {loadingNarrative
                  ? 'Generating…'
                  : showNarrative
                    ? 'Hide narrative'
                    : narrative
                      ? 'Show narrative'
                      : 'Deeper explanation'}
              </button>
              <button
                type="button"
                onClick={submitWrongTag}
                disabled={tagSubmitted}
                className="text-[9px] uppercase tracking-wide text-[#4B5A7A] hover:text-[#E05252] disabled:text-[#4BF2A2] disabled:cursor-default"
              >
                {tagSubmitted ? '✓ Tagged' : 'Tag as wrong'}
              </button>
              {tagError && <span className="text-[9px] text-[#E05252]">{tagError}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
