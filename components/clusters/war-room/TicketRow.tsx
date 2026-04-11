'use client'

import { OverduePill } from './OverduePill'
import type { WarRoomTicketRow } from '@/app/api/clusters/war-room/route'

/**
 * TicketRow — 1-line war-room row for Tickets mode.
 *
 * Spec §3.1:
 *   severity dot · SLA pill · situation line · owner
 *
 * The situation line is `{what is broken, where} · {blocker or state}`
 * (see lib/tickets/situation-line.ts), generated during upsertTickets
 * and backfilled once by scripts/backfill/situation-lines.ts. The age
 * is NOT rendered as a separate column — the SLA pill carries timing
 * information and adding age would duplicate the signal.
 *
 * Row format, L→R, fixed order:
 *   1. severity dot (1.5×1.5, sla-state colored)
 *   2. SLA pill (reuses OverduePill; hidden when not overdue and not due-soon)
 *   3. situation line (flex-1, clamps to 1 line)
 *   4. owner (dim, trailing, pre-resolved — never a raw open_id)
 *
 * Click behavior: opens the detail side-panel via onClick({ type, id }).
 */

const SEV_DOT: Record<string, string> = {
  RED: '#FF5A4E',
  YELLOW: '#E8A838',
  GREEN: '#4B5A7A',
}

interface TicketRowProps {
  row: WarRoomTicketRow
  onClick?: (payload: { type: 'ticket'; id: string }) => void
}

export function TicketRow({ row, onClick }: TicketRowProps) {
  const isOverdue = row.sla_overdue
  const dotColor = SEV_DOT[row.severity] ?? '#4B5A7A'
  // Tooltip — full human description + ticket# + unit + property
  // so hover still works for commanders who prefer scanning over
  // opening the detail drawer.
  const tooltipBits: string[] = []
  if (row.hover_description) tooltipBits.push(row.hover_description)
  tooltipBits.push(`#${row.ticket_id}`)
  if (row.unit_number) tooltipBits.push(row.unit_number)
  if (row.property) tooltipBits.push(row.property)
  const tooltip = tooltipBits.join(' · ')

  return (
    <button
      type="button"
      onClick={() => onClick?.({ type: 'ticket', id: row.id })}
      title={tooltip}
      className="w-full text-left block transition-colors hover:bg-[#111D30] focus:outline-none focus:bg-[#111D30] cursor-pointer"
      style={{
        // Spec §4 — subtle coral tint + 2px left border on overdue rows
        backgroundColor: isOverdue ? 'rgba(255, 90, 78, 0.06)' : 'transparent',
        borderLeft: isOverdue ? '2px solid #FF5A4E' : '2px solid transparent',
        padding: '8px 6px 8px 8px',
      }}
    >
      <div className="flex items-center gap-2 text-[11.5px] leading-tight">
        {/* Severity dot */}
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        {/* SLA pill — reuses OverduePill by projecting sla_date into
            a synthetic escalation_due_at (end-of-day UTC). */}
        <OverduePill
          escalation_due_at={row.sla_due_at}
          escalated={false}
        />
        {/* Situation line — the hero of this feature. One clamp, no
            truncation if possible; 480px columns × 340px usable width
            is budgeted for 12 words at 11.5px per spec §3.5. */}
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
