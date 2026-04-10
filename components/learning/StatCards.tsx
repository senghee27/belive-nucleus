'use client'

export type GlobalStats = {
  total: number
  approvedV1: number
  approvedEdited: number
  discarded: number
  acceptanceRate: number
  editRate: number
  discardRate: number
}

function StatCard({ label, value, pct, color }: { label: string; value: number; pct: number | null; color: string }) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-3 text-center">
      <p className="text-[22px] font-bold font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{value}</p>
      <p className="text-[10px] text-[#4B5A7A] mt-0.5">{label}</p>
      {pct !== null && <p className="text-[9px] text-[#8A9BB8] mt-0.5">{pct}%</p>}
    </div>
  )
}

export function StatCards({ stats }: { stats: GlobalStats | null }) {
  return (
    <div className="grid grid-cols-4 gap-3">
      <StatCard label="Total Proposals" value={stats?.total ?? 0} pct={null} color="#E8EEF8" />
      <StatCard label="Sent as-is (v1)" value={stats?.approvedV1 ?? 0} pct={stats?.acceptanceRate ?? 0} color="#4BF2A2" />
      <StatCard label="Edited before send" value={stats?.approvedEdited ?? 0} pct={stats?.editRate ?? 0} color="#E8A838" />
      <StatCard label="Discarded" value={stats?.discarded ?? 0} pct={stats?.discardRate ?? 0} color="#E05252" />
    </div>
  )
}
