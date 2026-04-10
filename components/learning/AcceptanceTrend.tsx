'use client'

export type TrendDay = { date: string; total: number; approved: number; rate: number }

const trendBarColor = (rate: number) => rate >= 70 ? '#4BF2A2' : rate >= 50 ? '#E8A838' : '#E05252'

export function AcceptanceTrend({ trend }: { trend: TrendDay[] }) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
      <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Acceptance Trend (30 days)</h3>
      {trend.length === 0 ? (
        <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No trend data yet</p>
      ) : (
        <div className="flex items-end gap-1 h-20">
          {trend.map(d => (
            <div key={d.date} className="flex-1 flex flex-col items-center justify-end" title={`${d.date}: ${d.approved}/${d.total} (${d.rate}%)`}>
              <div className="w-full rounded-t" style={{ height: `${Math.max(d.rate, 4)}%`, backgroundColor: trendBarColor(d.rate) }} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
