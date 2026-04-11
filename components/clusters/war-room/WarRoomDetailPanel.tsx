'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { X, ExternalLink } from 'lucide-react'
import { ReasoningPanel } from '@/components/command/ReasoningPanel'
import type { WarRoomTicketRow, WarRoomIncidentRow } from '@/app/api/clusters/war-room/route'

/**
 * WarRoomDetailPanel — 400px right slide-in for the /clusters war-room.
 *
 * Spec §3.4: clicking any row opens this panel on top of the grid,
 * keeping the grid visible behind it so the commander can jump between
 * rows without losing scroll position or mental context. Clicking
 * another row while the panel is open swaps the content without
 * animation (no flicker).
 *
 * The panel reads from in-memory war-room data — it's passed the
 * already-loaded row directly rather than fetching again. The only
 * exception is the 6-step Reasoning Trace for Command mode incidents,
 * which ReasoningPanel fetches itself from
 * /api/incidents/[id]/reasoning.
 */

type SelectedRow =
  | { type: 'ticket'; row: WarRoomTicketRow }
  | { type: 'incident'; row: WarRoomIncidentRow }

interface WarRoomDetailPanelProps {
  selected: SelectedRow | null
  onClose: () => void
}

export function WarRoomDetailPanel({ selected, onClose }: WarRoomDetailPanelProps) {
  // ESC to close — matches commanders' muscle memory from the old
  // IncidentDetail page navigation.
  useEffect(() => {
    if (!selected) return
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [selected, onClose])

  if (!selected) return null

  return (
    <div
      className="fixed inset-0 z-40 pointer-events-none"
      aria-hidden={false}
    >
      {/* Click-through scrim: catches clicks outside the panel so the
          commander can dismiss without hitting the × button. Pointer
          events only on this layer, not the panel itself. */}
      <button
        type="button"
        aria-label="Close detail panel"
        onClick={onClose}
        className="absolute inset-0 bg-black/30 pointer-events-auto"
      />

      {/* The panel — fixed to the right edge, 400px wide. */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Row detail"
        className="absolute top-0 right-0 h-full w-[400px] bg-[#0D1525] border-l border-[#1A2035] shadow-2xl flex flex-col pointer-events-auto"
        style={{ animation: 'war-room-slide-in 140ms ease-out' }}
      >
        <style>{`
          @keyframes war-room-slide-in {
            from { transform: translateX(12px); opacity: 0.6; }
            to { transform: translateX(0); opacity: 1; }
          }
        `}</style>

        {selected.type === 'incident'
          ? <IncidentDetail row={selected.row} onClose={onClose} />
          : <TicketDetail row={selected.row} onClose={onClose} />}
      </aside>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared header
// ---------------------------------------------------------------------------

function PanelHeader({
  badge,
  title,
  subtitle,
  onClose,
  externalHref,
  externalLabel,
}: {
  badge: string
  title: string
  subtitle: string | null
  onClose: () => void
  externalHref?: string
  externalLabel?: string
}) {
  return (
    <header className="flex items-start gap-2 px-4 py-3 border-b border-[#1A2035] shrink-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[9px] uppercase tracking-wider font-semibold text-[#F2784B]">{badge}</span>
          {externalHref && externalLabel && (
            <Link
              href={externalHref}
              className="text-[9px] text-[#4B5A7A] hover:text-[#F2784B] transition-colors inline-flex items-center gap-1"
            >
              <ExternalLink size={9} /> {externalLabel}
            </Link>
          )}
        </div>
        <h2 className="text-[13px] font-semibold text-[#E8EEF8] leading-tight">{title}</h2>
        {subtitle && (
          <p className="text-[10px] text-[#8A9BB8] mt-1 leading-relaxed">{subtitle}</p>
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close"
        className="shrink-0 w-7 h-7 flex items-center justify-center rounded text-[#4B5A7A] hover:text-[#E8EEF8] hover:bg-[#111D30] transition-colors"
      >
        <X size={14} />
      </button>
    </header>
  )
}

// ---------------------------------------------------------------------------
// Incident detail (Command mode)
// ---------------------------------------------------------------------------

function IncidentDetail({ row, onClose }: { row: WarRoomIncidentRow; onClose: () => void }) {
  return (
    <>
      <PanelHeader
        badge={`Incident · ${row.priority} · ${row.severity}`}
        title={row.title}
        subtitle={row.situation_summary || (row.raw_lark_text ? `[unclassified] ${row.raw_lark_text.slice(0, 120)}` : null)}
        onClose={onClose}
        externalHref={`/command/${row.id}`}
        externalLabel="Open full page"
      />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Raw Lark preservation */}
        {row.raw_lark_text && (
          <section>
            <h3 className="text-[9px] uppercase tracking-wider text-[#4B5A7A] font-semibold mb-1.5">
              Raw Lark message
            </h3>
            <p className="text-[11px] text-[#B0B8CC] leading-relaxed whitespace-pre-wrap">
              {row.raw_lark_text}
            </p>
          </section>
        )}

        {/* Full 6-step reasoning trace — reuses the existing component
            which fetches /api/incidents/[id]/reasoning and renders the
            same panel as the /command/[id] page. */}
        <section>
          <h3 className="text-[9px] uppercase tracking-wider text-[#4B5A7A] font-semibold mb-1.5">
            Reasoning Trace
          </h3>
          <ReasoningPanel incidentId={row.id} />
        </section>

        {/* Metadata footer */}
        <section className="pt-3 border-t border-[#1A2035] space-y-1.5">
          <DetailField label="Cluster" value={/* cluster shown in column header */ '—'} muted />
          <DetailField label="Category" value={row.category} />
          <DetailField label="Owner" value={row.owner_display} />
          <DetailField label="Status" value={row.status} />
          <DetailField label="Assigned to" value={row.assigned_to ?? '—'} />
          <DetailField label="Created" value={new Date(row.created_at).toLocaleString('en-MY')} muted />
          {row.escalation_due_at && (
            <DetailField label="SLA due" value={new Date(row.escalation_due_at).toLocaleString('en-MY')} muted />
          )}
        </section>
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Ticket detail (Tickets mode)
// ---------------------------------------------------------------------------

function TicketDetail({ row, onClose }: { row: WarRoomTicketRow; onClose: () => void }) {
  const slaLabel = row.sla_overdue
    ? `Overdue${row.sla_date ? ` since ${new Date(row.sla_date).toLocaleDateString('en-MY')}` : ''}`
    : row.sla_date
      ? `Due ${new Date(row.sla_date).toLocaleDateString('en-MY')}`
      : 'No SLA set'

  return (
    <>
      <PanelHeader
        badge={`Ticket · ${row.ticket_id}`}
        title={row.title}
        subtitle={row.hover_description || null}
        onClose={onClose}
      />
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {/* Situation-line source material */}
        {row.hover_description && row.hover_description !== row.title && (
          <section>
            <h3 className="text-[9px] uppercase tracking-wider text-[#4B5A7A] font-semibold mb-1.5">
              Original description
            </h3>
            <p className="text-[11px] text-[#B0B8CC] leading-relaxed whitespace-pre-wrap">
              {row.hover_description}
            </p>
          </section>
        )}

        {/* Location */}
        <section className="space-y-1.5">
          <DetailField label="Unit" value={row.unit_number ?? '—'} />
          {row.property && <DetailField label="Property" value={row.property} />}
          <DetailField label="Cluster" value={row.cluster} />
          <DetailField label="Category" value={row.category} />
        </section>

        {/* Status */}
        <section className="pt-3 border-t border-[#1A2035] space-y-1.5">
          <DetailField label="SLA" value={slaLabel} muted={!row.sla_overdue} />
          <DetailField label="Age" value={`${Math.round(row.age_days)} days`} muted />
          <DetailField label="Owner" value={row.owner_display} />
        </section>

        {/* Placeholder for future action buttons — reassign / close /
            escalate / comment. No backing API yet; spec §3.4 flags
            these as required but the operational ticket system isn't
            writeable from Nucleus today, so they're omitted rather
            than stubbed as fake buttons. */}
      </div>
    </>
  )
}

// ---------------------------------------------------------------------------
// Small bits
// ---------------------------------------------------------------------------

function DetailField({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="text-[9px] uppercase tracking-wider text-[#4B5A7A] font-semibold">{label}</span>
      <span className={muted ? 'text-[#8A9BB8] text-right truncate' : 'text-[#D4DAEA] text-right truncate'}>
        {value}
      </span>
    </div>
  )
}
