'use client'

import type { CategoryLearningStats } from '@/lib/types'

const accuracyColor = (rate: number) => rate >= 80 ? '#4BF2A2' : rate >= 50 ? '#E8A838' : '#E05252'

export function AutonomyStatus({ categories, onToggle }: {
  categories: CategoryLearningStats[]
  onToggle: (category: string, enabled: boolean) => void
}) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
      <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Autonomy Status</h3>
      {categories.length === 0 ? (
        <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No categories yet</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[9px] text-[#4B5A7A] uppercase tracking-wider border-b border-[#1A2035]">
              <th className="text-left pb-2">Category</th>
              <th className="text-right pb-2">Rate</th>
              <th className="text-right pb-2">Last 20</th>
              <th className="text-right pb-2">Streak</th>
              <th className="text-right pb-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(c => {
              const last20Approved = (c.last_20_outcomes ?? []).filter(o => o === 'approved').length
              const last20Total = (c.last_20_outcomes ?? []).length
              return (
                <tr key={c.category} className="border-b border-[#1A2035]/30">
                  <td className="py-2 text-[#E8EEF8] capitalize">{c.category.replace(/_/g, ' ')}</td>
                  <td className="py-2 text-right font-[family-name:var(--font-jetbrains-mono)]" style={{ color: accuracyColor(c.acceptance_rate) }}>
                    {Math.round(c.acceptance_rate)}%
                  </td>
                  <td className="py-2 text-right text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{last20Approved}/{last20Total}</td>
                  <td className="py-2 text-right text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)]">{c.consecutive_approvals}</td>
                  <td className="py-2 text-right">
                    {c.auto_send_enabled ? (
                      <button onClick={() => onToggle(c.category, false)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#4BF2A2]/15 text-[#4BF2A2]">Auto ✓</button>
                    ) : c.auto_send_eligible ? (
                      <button onClick={() => onToggle(c.category, true)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-[#E8A838]/15 text-[#E8A838]">Eligible</button>
                    ) : (
                      <span className="text-[10px] text-[#4B5A7A]">Manual</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
