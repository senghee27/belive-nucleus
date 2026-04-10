'use client'

import { useState, useEffect, useCallback } from 'react'
import { ChevronDown, ChevronUp, RotateCw, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { DEFAULT_FEEDBACK_TAGS, FEEDBACK_TAG_COLORS } from '@/lib/types'
import type { ProposalRevision } from '@/lib/types'

export function ProposalRevisionPanel({ incidentId, originalProposal, originalConfidence, onRevisionUpdate }: {
  incidentId: string
  originalProposal: string
  originalConfidence: number
  onRevisionUpdate?: (proposal: string, confidence: number) => void
}) {
  const [revisions, setRevisions] = useState<ProposalRevision[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedTags, setSelectedTags] = useState<string[]>([])
  const [feedbackText, setFeedbackText] = useState('')
  const [regenerating, setRegenerating] = useState(false)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})

  const fetchRevisions = useCallback(async () => {
    try {
      const r = await fetch(`/api/incidents/${incidentId}/revisions`)
      const d = await r.json()
      if (d.ok) setRevisions(d.revisions)
    } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [incidentId])

  useEffect(() => { fetchRevisions() }, [fetchRevisions])

  const current = revisions.length > 0 ? revisions[revisions.length - 1] : null
  const currentVersion = current?.version_number ?? 1
  const totalVersions = revisions.length || 1

  const proposalText = current?.proposal_text ?? originalProposal
  const confidence = current?.ai_confidence ?? originalConfidence

  const toggleTag = (tag: string) => {
    setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])
  }

  const handleRegenerate = async () => {
    if (selectedTags.length === 0 && !feedbackText.trim()) {
      toast.error('Add at least one tag or feedback text')
      return
    }
    setRegenerating(true)
    try {
      // 1. Submit feedback on current version
      await fetch(`/api/incidents/${incidentId}/revisions/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version: currentVersion, tags: selectedTags, text: feedbackText }),
      })

      // 2. Trigger regeneration
      const r = await fetch(`/api/incidents/${incidentId}/revisions/regenerate`, { method: 'POST' })
      const d = await r.json()
      if (!d.ok) throw new Error(d.error ?? 'Regenerate failed')

      // 3. Reload chain
      await fetchRevisions()
      setSelectedTags([])
      setFeedbackText('')

      // 4. Notify parent
      if (d.revision && onRevisionUpdate) {
        onRevisionUpdate(d.revision.proposal_text, d.revision.ai_confidence ?? 0)
      }

      toast.success(`Regenerated to v${d.revision?.version_number}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Regenerate failed')
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return <div className="text-[10px] text-[#4B5A7A]">Loading revisions...</div>
  }

  return (
    <div className="space-y-3">
      {/* Header bar */}
      <div className="flex items-center justify-between">
        <span className="text-[9px] text-[#4B5A7A] uppercase tracking-wider">Proposed Action</span>
        <div className="flex items-center gap-2">
          {totalVersions > 1 && (
            <span className="text-[9px] text-[#9B6DFF] bg-[#9B6DFF]/10 px-1.5 py-0.5 rounded">
              v{currentVersion} of {totalVersions}
            </span>
          )}
          <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)]"
            style={{ color: confidence >= 85 ? '#4BF2A2' : confidence >= 65 ? '#E8A838' : '#E05252' }}>
            {confidence}%
          </span>
        </div>
      </div>

      {/* Active proposal */}
      <div className="bg-[#080E1C] border border-[#1A2035] rounded-lg p-3">
        <p className="text-[11px] text-[#E8EEF8] leading-relaxed whitespace-pre-wrap">{proposalText}</p>
      </div>

      {/* Revision accordion */}
      {revisions.length > 1 && (
        <div className="space-y-1 border-l-2 border-[#1A2035] pl-2">
          {revisions.slice(0, -1).map(rev => {
            const isOpen = expanded[rev.version_number] ?? false
            const hasFeedback = (rev.feedback_tags && rev.feedback_tags.length > 0) || rev.feedback_text
            return (
              <div key={rev.id}>
                <button onClick={() => setExpanded(prev => ({ ...prev, [rev.version_number]: !isOpen }))}
                  className="flex items-center gap-1.5 w-full text-left text-[10px] text-[#8A9BB8] hover:text-[#E8EEF8] py-1">
                  {isOpen ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                  <span>v{rev.version_number} — {rev.version_number === 1 ? 'AI original' : 'revised'}</span>
                  {hasFeedback && rev.feedback_tags?.slice(0, 2).map(t => (
                    <span key={t} className="text-[8px] px-1 py-0.5 rounded"
                      style={{ color: FEEDBACK_TAG_COLORS[t] ?? '#8A9BB8', backgroundColor: `${FEEDBACK_TAG_COLORS[t] ?? '#8A9BB8'}15` }}>
                      {t}
                    </span>
                  ))}
                  <span className="ml-auto text-[9px] text-[#4B5A7A]">
                    {new Date(rev.created_at).toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </button>
                {isOpen && (
                  <div className="ml-3 mt-1 mb-2 space-y-2">
                    <div className="bg-[#080E1C] border border-[#1A2035] rounded p-2">
                      <p className="text-[10px] text-[#8A9BB8] whitespace-pre-wrap">{rev.proposal_text}</p>
                    </div>
                    {hasFeedback && (
                      <div className="border-l-2 border-[#E8A838] bg-[#E8A838]/5 p-2 rounded">
                        <p className="text-[8px] text-[#E8A838] uppercase tracking-wider mb-1">Lee&apos;s Feedback</p>
                        {rev.feedback_text && <p className="text-[10px] text-[#E8EEF8] mb-1">{rev.feedback_text}</p>}
                        {rev.feedback_tags && rev.feedback_tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {rev.feedback_tags.map(t => (
                              <span key={t} className="text-[8px] px-1 py-0.5 rounded"
                                style={{ color: FEEDBACK_TAG_COLORS[t] ?? '#8A9BB8', backgroundColor: `${FEEDBACK_TAG_COLORS[t] ?? '#8A9BB8'}15` }}>
                                {t}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Feedback input */}
      <div className="border-t border-[#1A2035] pt-3">
        <p className="text-[9px] text-[#4B5A7A] uppercase tracking-wider mb-2">Your Feedback</p>

        {/* Quick tags */}
        <div className="flex flex-wrap gap-1.5 mb-2">
          {DEFAULT_FEEDBACK_TAGS.map(tag => {
            const isSelected = selectedTags.includes(tag)
            const color = FEEDBACK_TAG_COLORS[tag] ?? '#8A9BB8'
            return (
              <button key={tag} onClick={() => toggleTag(tag)}
                className="text-[9px] px-2 py-0.5 rounded-full border transition-colors"
                style={isSelected
                  ? { color, borderColor: color, backgroundColor: `${color}20` }
                  : { color: '#8A9BB8', borderColor: '#2A3550', backgroundColor: '#151E35' }}>
                {tag}
              </button>
            )
          })}
        </div>

        {/* Textarea */}
        <textarea value={feedbackText} onChange={e => setFeedbackText(e.target.value)}
          placeholder="Type your feedback on this proposal..."
          className="w-full bg-[#080E1C] border border-[#1A2035] rounded p-2 text-[10px] text-[#E8EEF8] resize-none focus:outline-none focus:border-[#9B6DFF]/50 placeholder:text-[#2A3550]"
          rows={2} maxLength={500} />

        {/* Regenerate button */}
        <button onClick={handleRegenerate} disabled={regenerating || (selectedTags.length === 0 && !feedbackText.trim())}
          className="mt-2 w-full h-8 rounded-lg border border-[#9B6DFF]/40 text-[#9B6DFF] text-[10px] font-medium hover:bg-[#9B6DFF]/10 transition-colors disabled:opacity-30 flex items-center justify-center gap-1.5">
          {regenerating ? <RefreshCw size={11} className="animate-spin" /> : <RotateCw size={11} />}
          {regenerating ? 'Regenerating...' : 'Regenerate'}
        </button>
      </div>
    </div>
  )
}
