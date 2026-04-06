'use client'

const STATUS_DOT: Record<string, string> = { red: '#E05252', amber: '#E8A838', green: '#4BF2A2' }
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

export function CardHeader({ cluster, clusterName, healthStatus, healthScore }: {
  cluster: string; clusterName: string; healthStatus: string; healthScore: number
}) {
  const color = STATUS_DOT[healthStatus] ?? '#4B5A7A'
  const clusterColor = CLUSTER_COLORS[cluster] ?? '#4B5A7A'

  return (
    <div className="px-3.5 py-2.5 border-b border-[#1A2035] shrink-0">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color, boxShadow: `0 0 6px ${color}` }} />
        <span className="text-[13px] font-semibold font-[family-name:var(--font-jetbrains-mono)]" style={{ color: clusterColor }}>{cluster}</span>
        <span className="text-[12px] text-[#8A9BB8] flex-1 truncate">{clusterName}</span>
        <span className="text-[11px] font-bold font-[family-name:var(--font-jetbrains-mono)] px-1.5 py-0.5 rounded"
          style={{ color, backgroundColor: `${color}15` }}>
          {healthScore}
        </span>
      </div>
    </div>
  )
}
