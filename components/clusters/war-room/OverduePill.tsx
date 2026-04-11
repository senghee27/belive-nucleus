/**
 * OverduePill — SLA pill with explicit duration (not bare "OVR").
 *
 * Spec §3, Line 1:
 *   - Overdue  → filled coral   "2h OVR", "3d OVR", "12h OVR"
 *   - Due soon (<24h) → hollow amber "4h", "18h"
 *   - Otherwise → hidden (null)
 *
 * Always uses ESCALATION_DUE_AT as the truth source. A row with
 * escalation_due_at = null or escalated=true renders nothing.
 */

interface OverduePillProps {
  escalation_due_at: string | null
  escalated: boolean
}

function formatDuration(ms: number): string {
  const abs = Math.abs(ms)
  const hours = Math.floor(abs / 3600000)
  if (hours < 1) {
    const mins = Math.max(1, Math.floor(abs / 60000))
    return `${mins}m`
  }
  if (hours < 48) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

export function OverduePill({ escalation_due_at, escalated }: OverduePillProps) {
  if (!escalation_due_at || escalated) return null

  const due = new Date(escalation_due_at).getTime()
  const now = Date.now()
  const deltaMs = now - due

  // Overdue → filled coral pill with "<dur> OVR"
  if (deltaMs > 0) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[8px] font-[family-name:var(--font-jetbrains-mono)] font-semibold tracking-tight"
        style={{
          backgroundColor: '#FF5A4E',
          color: '#FFFFFF',
        }}
        title={`Overdue since ${new Date(escalation_due_at).toLocaleString('en-MY')}`}
      >
        {formatDuration(deltaMs)} OVR
      </span>
    )
  }

  // Due within 24h → hollow amber pill with just "<dur>"
  const remaining = -deltaMs
  if (remaining < 24 * 3600000) {
    return (
      <span
        className="inline-flex items-center gap-0.5 rounded px-1 py-px text-[8px] font-[family-name:var(--font-jetbrains-mono)] font-semibold tracking-tight border"
        style={{
          borderColor: '#E8A838',
          color: '#E8A838',
          backgroundColor: 'transparent',
        }}
        title={`Due in ${formatDuration(remaining)}`}
      >
        {formatDuration(remaining)}
      </span>
    )
  }

  // Not near SLA — render nothing
  return null
}
