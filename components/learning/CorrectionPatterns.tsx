'use client'

export type Pattern = { tag: string; count: number }

export function CorrectionPatterns({ patterns }: { patterns: Pattern[] }) {
  return (
    <div className="bg-[#0D1525] border border-[#1A2035] rounded-xl p-4">
      <h3 className="text-[10px] text-[#4B5A7A] uppercase tracking-wider font-bold mb-3">Top Correction Patterns</h3>
      {patterns.length === 0 ? (
        <p className="text-[11px] text-[#4B5A7A] py-4 text-center">No patterns yet</p>
      ) : (
        <div className="space-y-2">
          {patterns.slice(0, 6).map(p => {
            const max = patterns[0].count
            const width = Math.round((p.count / max) * 100)
            return (
              <div key={p.tag} className="flex items-center gap-2">
                <span className="text-[11px] text-[#E8EEF8] w-32 truncate">{p.tag}</span>
                <div className="flex-1 h-1.5 bg-[#1A2035] rounded-full overflow-hidden">
                  <div className="h-full bg-[#E8A838] rounded-full" style={{ width: `${width}%` }} />
                </div>
                <span className="text-[11px] text-[#8A9BB8] font-[family-name:var(--font-jetbrains-mono)] w-8 text-right">{p.count}x</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
