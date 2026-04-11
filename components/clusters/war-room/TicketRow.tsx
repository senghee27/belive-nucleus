'use client'

import { OverduePill } from './OverduePill'
import type { WarRoomTicketRow } from '@/app/api/clusters/war-room/route'

/**
 * TicketRow — 1-line war-room row for Tickets mode.
 *
 * Spec §3.1:
 *   severity dot · SLA pill · age · human ticket title · owner
 *
 * - Source: operational ticketing tables (ai_report_tickets)
 * - Human title rendered as-is (trusted ops system wording)
 * - AI summary lives on the hover tooltip, NOT inline — Tickets
 *   mode trusts the human's words, Command mode is where AI does
 *   the load-bearing work
 * - P1 coral tinting applied when the ticket is overdue (overdue IS
 *   the P1 condition in Tickets mode — SLA state drives severity)
 * - Owner is pre-resolved server-side via sanitizeOwnerLabel, so
 *   raw open_ids can never leak through
 */

const SEV_DOT: Record<string, string> = {
  RED: '#FF5A4E',
  YELLOW: '#E8A838',
  GREEN: '#4B5A7A',
}

function ageLabel(age_days: number): string {
  if (age_days < 1) {
    const hours = Math.round(age_days * 24)
    return `${hours}h`
  }
  if (age_days < 30) return `${Math.round(age_days)}d`
  if (age_days < 365) return `${Math.round(age_days / 30)}mo`
  return `${Math.round(age_days / 365)}y`
}

interface TicketRowProps {
  row: WarRoomTicketRow
  onClick?: (ticketId: string) => void
}

export function TicketRow({ row, onClick }: TicketRowProps) {
  const isOverdue = row.sla_overdue
  const dotColor = SEV_DOT[row.severity] ?? '#4B5A7A'
  // Tooltip content — human description + ticket# + unit + property
  // so hover gives the full context without needing a drawer click.
  const tooltipBits: string[] = []
  if (row.hover_description) tooltipBits.push(row.hover_description)
  tooltipBits.push(`#${row.ticket_id}`)
  if (row.unit_number) tooltipBits.push(row.unit_number)
  if (row.property) tooltipBits.push(row.property)
  const tooltip = tooltipBits.join(' · ')

  return (
    <button
      type="button"
      onClick={() => onClick?.(row.ticket_id)}
      title={tooltip}
      className="w-full text-left block transition-colors hover:bg-[#111D30] focus:outline-none focus:bg-[#111D30] cursor-pointer"
      style={{
        // Spec §4 — subtle coral tint + 2px left border on overdue rows
        backgroundColor: isOverdue ? 'rgba(255, 90, 78, 0.06)' : 'transparent',
        borderLeft: isOverdue ? '2px solid #FF5A4E' : '2px solid transparent',
        padding: '8px 6px 8px 8px',
      }}
    >
      <div className="flex items-center gap-2 text-[11px] leading-tight">
        {/* Severity dot */}
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        {/* SLA pill — reuses the shared OverduePill; tickets project
            sla_due_at as a synthetic escalation_due_at so the pill
            works unchanged. */}
        <OverduePill
          escalation_due_at={row.sla_due_at}
          escalated={false}
        />
        {/* Age — longest-open bubble the eye to the left */}
        <span className="font-[family-name:var(--font-jetbrains-mono)] text-[10px] text-[#4B5A7A] shrink-0">
          {ageLabel(row.age_days)}
        </span>
        {/* Human title — trusted, rendered as-is */}
        <span
          className="flex-1 min-w-0 text-[#D4DAEA]"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {row.title}
        </span>
        {/* Owner — dim, trailing */}
        <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A] shrink-0">
          — {row.owner_display}
        </span>
      </div>
    </button>
  )
}
