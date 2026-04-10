'use client'

import type { CategoryLearningStats } from '@/lib/types'

const accuracyColor = (rate: number) => rate >= 80 ? '#4BF2A2' : rate >= 50 ? '#E8A838' : '#E05252'

export function CategoryAccuracy({ categories }: { categories: CategoryLearningStats[] }) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
      <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Accuracy by Category</h3>
      {categories.length === 0 ? (
        <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No data yet</p>
      ) : (
        <div className="space-y-2">
          {categories.slice(0, 8).map(c => (
            <div key={c.category} className="flex items-center gap-2">
              <span className="text-[11px] text-[#E8EEF8] w-32 truncate capitalize">{c.category.replace(/_/g, ' ')}</span>
              <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                <div className="h-full rounded-full" style={{ width: `${c.acceptance_rate}%`, backgroundColor: accuracyColor(c.acceptance_rate) }} />
              </div>
              <span className="text-[11px] font-[family-name:var(--font-jetbrains-mono)] w-10 text-right" style={{ color: accuracyColor(c.acceptance_rate) }}>
                {Math.round(c.acceptance_rate)}%
              </span>
              {c.auto_send_enabled && <span className="text-[8px] text-[#4BF2A2]">✓</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
