/**
 * CategoryHeader — section header for a war-room column category.
 *
 * Spec §6:
 *   CategoryName     total · N ovr
 *   (left-aligned)   (right-aligned, coral if overdue > 0)
 *
 * The overdue count is itself a diagnostic — "131 · 95 ovr" on
 * Maintenance reads as "72% overdue rate, this cluster is bleeding."
 */

interface CategoryHeaderProps {
  label: string
  total: number
  overdue: number
}

export function CategoryHeader({ label, total, overdue }: CategoryHeaderProps) {
  const hasOverdue = overdue > 0
  return (
    <div
      className="flex items-center justify-between px-1 pb-0.5 pt-1 border-b border-[#1A2035]/60"
      style={{ height: 20 }}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider text-[#8A9BB8]">
        {label}
      </span>
      <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] flex items-center gap-1">
        <span className="text-[#4B5A7A]">{total}</span>
        {hasOverdue && (
          <>
            <span className="text-[#2A3550]">·</span>
            <span style={{ color: '#FF5A4E' }}>{overdue} ovr</span>
          </>
        )}
      </span>
    </div>
  )
}
