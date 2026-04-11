'use client'

import { formatDistanceToNowStrict } from 'date-fns'
import { OverduePill } from './OverduePill'
import type { WarRoomRow } from '@/app/api/clusters/war-room/route'

/**
 * SituationRow — 2-line war-room situation report.
 *
 * Line 1 (monospace, dim):
 *   severity_dot · SLA_pill · age
 * Line 2:
 *   AI situation_summary  — owner   (normal)
 *   [unclassified] raw_lark_text first 80 chars — owner   (amber)
 *
 * P1 rows: coral background tint + 2px coral left border.
 * Unclassified rows: text switches to amber so commander sees
 * "AI hasn't touched this yet" instantly.
 *
 * No ticket numbers — spec §3 explicitly forbids them on the wall.
 * Ticket# surfaces only on the hover tooltip.
 */

const SEV_DOT: Record<string, string> = {
  RED: '#E05252',
  YELLOW: '#E8A838',
  GREEN: '#4B5A7A',
}

const PRIORITY_DOT: Record<string, string> = {
  P1: '#FF5A4E', // coral — must pop at scan distance
  P2: '#E8A838',
  P3: '#4B5A7A',
}

// Owner label is now pre-resolved server-side by the war-room API
// (see app/api/clusters/war-room/route.ts → ownerDisplayFor). The client
// just reads owner_display and never touches sender_open_id / sender_name,
// so raw open_ids from the pre-fix webhook can't leak into the UI.

function ageLabel(createdAt: string): string {
  try {
    const d = formatDistanceToNowStrict(new Date(createdAt))
    // Compress "5 days" → "5d", "3 hours" → "3h", "12 minutes" → "12m"
    return d
      .replace(/\s+days?$/, 'd')
      .replace(/\s+hours?$/, 'h')
      .replace(/\s+minutes?$/, 'm')
      .replace(/\s+seconds?$/, 's')
      .replace(/\s+months?$/, 'mo')
      .replace(/\s+years?$/, 'y')
  } catch {
    return ''
  }
}

interface SituationRowProps {
  row: WarRoomRow
  onClick?: (id: string) => void
}

export function SituationRow({ row, onClick }: SituationRowProps) {
  const isP1 = row.priority === 'P1'
  const dotColor = PRIORITY_DOT[row.priority] ?? SEV_DOT[row.severity] ?? '#4B5A7A'
  const owner = row.owner_display || '— unknown'
  const age = ageLabel(row.created_at)

  // Spec §5: unclassified rows render raw tenant text in amber
  const unclassified = !row.is_classified
  const fallbackText = (row.raw_lark_text ?? '').slice(0, 80)
  const mainText = unclassified
    ? `[unclassified] ${fallbackText}`
    : row.situation_summary ?? row.title

  const textColor = unclassified ? '#f5a524' : '#D4DAEA'
  const dimColor = '#4B5A7A'

  return (
    <button
      type="button"
      onClick={() => onClick?.(row.id)}
      title={row.title}
      className="w-full text-left block transition-colors hover:bg-[#111D30] focus:outline-none focus:bg-[#111D30] cursor-pointer"
      style={{
        // Spec §4 — subtle coral tint + 2px left border for P1
        backgroundColor: isP1 ? 'rgba(255, 90, 78, 0.06)' : 'transparent',
        borderLeft: isP1 ? '2px solid #FF5A4E' : '2px solid transparent',
        padding: '5px 6px 5px 8px',
      }}
    >
      {/* Line 1 — monospace, dim, compact */}
      <div
        className="flex items-center gap-1.5 font-[family-name:var(--font-jetbrains-mono)] text-[10.5px] leading-none"
        style={{ color: dimColor }}
      >
        <span
          className="inline-block w-1.5 h-1.5 rounded-full shrink-0"
          style={{ backgroundColor: dotColor }}
        />
        <OverduePill
          escalation_due_at={row.escalation_due_at}
          escalated={row.escalated}
        />
        {age && <span className="ml-auto">{age}</span>}
      </div>

      {/* Line 2 — AI situation summary (or fallback) + trailing owner */}
      <div
        className="mt-[3px] flex items-baseline gap-1 text-[11.5px] leading-[1.3]"
        style={{ color: textColor }}
      >
        <span
          className="truncate"
          style={{
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            flex: '1 1 auto',
            minWidth: 0,
          }}
        >
          {mainText}
        </span>
        <span
          className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] shrink-0"
          style={{ color: dimColor }}
        >
          — {owner}
        </span>
      </div>
    </button>
  )
}
