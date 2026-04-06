'use client'

type TicketItem = { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }

function getAgeColor(ageDays: number): string {
  if (ageDays > 60) return '#E05252'
  if (ageDays > 30) return '#E8A838'
  return '#4B5A7A'
}

function OVRBadge() {
  return <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] px-1 py-px rounded border border-[#E05252] bg-[#E05252]/10 text-[#E05252]">OVR</span>
}

function IssueRow({ item }: { item: TicketItem }) {
  const bgClass = item.age_days > 90 ? 'bg-[rgba(224,82,82,0.04)]' : ''
  return (
    <div className={`h-[42px] px-3 flex flex-col justify-center ${bgClass}`}>
      <div className="flex items-center gap-1">
        <span className="text-[12px] text-[#E8EEF8] font-medium truncate flex-1 leading-tight">
          {item.title.length > 45 ? item.title.slice(0, 45) + '…' : item.title}
        </span>
        <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)] shrink-0" style={{ color: getAgeColor(item.age_days) }}>
          {item.age_days}d
        </span>
        {item.sla_overdue && <OVRBadge />}
      </div>
      <div className="text-[11px] text-[#8A9BB8] truncate leading-tight">
        {item.owner_name}{item.unit && item.unit !== '—' ? ` · ${item.unit}` : ''}
      </div>
    </div>
  )
}

function CategorySection({ icon, label, total, overdueCount, items, cluster, category, onMoreClick }: {
  icon: string; label: string; total: number; overdueCount: number
  items: TicketItem[]; cluster: string; category: string
  onMoreClick: (cluster: string, category: string) => void
}) {
  const labelColor = overdueCount > 0 ? '#E8A838' : total > 0 ? '#E8EEF8' : '#4B5A7A'
  const remaining = total - items.length

  return (
    <div className="h-[176px] flex flex-col">
      {/* Category header — 28px */}
      <div className="h-7 flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-1.5">
          <span className="text-[12px]">{icon}</span>
          <span className="text-[11px] font-semibold" style={{ color: labelColor }}>{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: labelColor }}>{total}</span>
          {overdueCount > 0 && (
            <span className="text-[9px] font-bold px-1.5 py-px rounded-full bg-[#E05252]/15 text-[#E05252]">{overdueCount} OVR</span>
          )}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-[#1A2035] shrink-0" />

      {/* Issue rows — flex-1 */}
      <div className="flex-1 overflow-hidden">
        {items.length === 0 ? (
          <div className="h-full flex items-center justify-center text-[11px] text-[#2A3550]">No issues</div>
        ) : (
          items.map(item => <IssueRow key={item.id} item={item} />)
        )}
      </div>

      {/* More link — 20px */}
      {remaining > 0 && (
        <button onClick={() => onMoreClick(cluster, category)}
          className="h-5 px-3 text-left text-[11px] text-[#F2784B] hover:text-[#F2784B]/80 shrink-0">
          +{remaining} more →
        </button>
      )}
      {remaining <= 0 && <div className="h-5 shrink-0" />}
    </div>
  )
}

export function CategoryView({ data, onMoreClick }: {
  data: {
    cluster: string
    maintenance_total: number; maintenance_overdue: number; top_maintenance: TicketItem[]
    cleaning_total: number; cleaning_overdue: number; top_cleaning: TicketItem[]
    move_in_pending: number; move_in_overdue: number; top_movein: TicketItem[]
    turnaround_total: number; turnaround_breach: number; top_moveout: TicketItem[]
  }
  onMoreClick: (cluster: string, category: string) => void
}) {
  return (
    <div className="h-full flex flex-col">
      <CategorySection icon="🔧" label="Maintenance" total={data.maintenance_total} overdueCount={data.maintenance_overdue}
        items={(data.top_maintenance ?? []).slice(0, 3)} cluster={data.cluster} category="maintenance" onMoreClick={onMoreClick} />
      <div className="h-px bg-[#1A2035] shrink-0" />
      <CategorySection icon="🧹" label="Cleaning" total={data.cleaning_total} overdueCount={data.cleaning_overdue}
        items={(data.top_cleaning ?? []).slice(0, 3)} cluster={data.cluster} category="cleaning" onMoreClick={onMoreClick} />
      <div className="h-px bg-[#1A2035] shrink-0" />
      <CategorySection icon="→" label="Move In" total={data.move_in_pending} overdueCount={data.move_in_overdue}
        items={(data.top_movein ?? []).slice(0, 3)} cluster={data.cluster} category="move_in" onMoreClick={onMoreClick} />
      <div className="h-px bg-[#1A2035] shrink-0" />
      <CategorySection icon="↺" label="Turnaround" total={data.turnaround_total} overdueCount={data.turnaround_breach}
        items={(data.top_moveout ?? []).slice(0, 3)} cluster={data.cluster} category="move_out" onMoreClick={onMoreClick} />
    </div>
  )
}
