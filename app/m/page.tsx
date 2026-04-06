'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import type { Incident } from '@/lib/types'

const SEV_DOT: Record<string, string> = { red: '#E05252', amber: '#E8A838', green: '#4BF2A2' }
const CLUSTER_COLORS: Record<string, string> = { C1:'#F2784B',C2:'#9B6DFF',C3:'#4BB8F2',C4:'#4BF2A2',C5:'#E8A838',C6:'#F27BAD',C7:'#6DD5F2',C8:'#B46DF2',C9:'#F2C96D',C10:'#6DF2B4',C11:'#E05252' }

type Summary = {
  p1_incidents: Incident[]
  p1_count: number
  awaiting_count: number
  resolved_today: number
  cluster_summary: { cluster: string; status: string }[]
}

export default function UrgentPage() {
  const router = useRouter()
  const [data, setData] = useState<Summary | null>(null)

  useEffect(() => {
    fetch('/api/m/summary').then(r => r.json()).then(d => { if (d.ok) setData(d) })
  }, [])

  const today = new Date().toLocaleDateString('en-MY', { weekday: 'short', day: 'numeric', month: 'short' })

  return (
    <div className="px-4 py-4">
      <p className="text-[13px] text-[#4B5A7A] mb-3">{today} · Good morning, Lee.</p>

      {/* Stat Summary */}
      <div className="grid grid-cols-3 bg-[#0D1525] border border-[#1A2035] rounded-[14px] overflow-hidden mb-5">
        <button onClick={() => router.push('/m')} className="flex flex-col items-center py-3 border-r border-[#1A2035]">
          <span className="text-[32px] font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#E05252]">{data?.p1_count ?? 0}</span>
          <span className="text-[11px] text-[#4B5A7A]">P1 Now</span>
        </button>
        <button onClick={() => router.push('/m/queue')} className="flex flex-col items-center py-3 border-r border-[#1A2035]">
          <span className="text-[32px] font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#E8A838]">{data?.awaiting_count ?? 0}</span>
          <span className="text-[11px] text-[#4B5A7A]">Queue</span>
        </button>
        <button className="flex flex-col items-center py-3">
          <span className="text-[32px] font-bold font-[family-name:var(--font-jetbrains-mono)] text-[#4BF2A2]">{data?.resolved_today ?? 0}</span>
          <span className="text-[11px] text-[#4B5A7A]">Resolved</span>
        </button>
      </div>

      {/* Critical section */}
      {(data?.p1_incidents ?? []).length > 0 && (
        <>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[13px] font-semibold text-[#E05252]">CRITICAL — ACT NOW</span>
            <span className="flex-1 h-px bg-[#E05252]/30" />
          </div>
          <div className="space-y-3 mb-5">
            {(data?.p1_incidents ?? []).map(inc => {
              const ageDays = Math.round((Date.now() - new Date(inc.created_at).getTime()) / 86400000)
              return (
                <div key={inc.id}
                  className="bg-[#0D1525] border border-[#E05252] border-l-4 rounded-[14px] p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[11px] font-bold text-[#E05252]">🔴 P1</span>
                    {inc.cluster && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded font-[family-name:var(--font-jetbrains-mono)]"
                        style={{ color: CLUSTER_COLORS[inc.cluster], backgroundColor: (CLUSTER_COLORS[inc.cluster] ?? '#4B5A7A') + '15' }}>
                        {inc.cluster}
                      </span>
                    )}
                    <span className="flex-1" />
                    <span className={`text-[11px] font-[family-name:var(--font-jetbrains-mono)] ${ageDays > 60 ? 'text-[#E05252]' : 'text-[#4B5A7A]'}`}>{ageDays}d</span>
                  </div>
                  <p className="text-[15px] font-semibold text-[#E8EEF8] mb-1 leading-snug">{inc.title}</p>
                  <p className="text-[13px] text-[#8A9BB8] mb-3">
                    {inc.sender_name ?? '—'} · {inc.status === 'awaiting_lee' ? '⚡ Awaiting Lee' : inc.status}
                  </p>
                  <button onClick={() => router.push(`/m/queue?focus=${inc.id}`)}
                    className="w-full h-11 bg-[#E05252] rounded-[10px] text-white text-[14px] font-semibold">
                    Act Now →
                  </button>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* Queue callout */}
      {(data?.awaiting_count ?? 0) > 0 && (
        <div className="flex items-center gap-2 mb-3">
          <span className="text-[13px] font-semibold text-[#E8A838]">AWAITING YOUR DECISION</span>
          <span className="flex-1 h-px bg-[#E8A838]/30" />
        </div>
      )}
      {(data?.awaiting_count ?? 0) > 0 && (
        <button onClick={() => router.push('/m/queue')}
          className="w-full bg-[#0D1525] border border-[#E8A838]/30 rounded-[14px] p-4 text-left">
          <p className="text-[13px] text-[#E8EEF8]">{data?.awaiting_count} incidents waiting</p>
          <p className="text-[11px] text-[#E8A838] mt-1">Clear Queue →</p>
        </button>
      )}

      {/* No urgent */}
      {!data?.p1_count && !data?.awaiting_count && (
        <div className="text-center py-16">
          <span className="text-3xl">✅</span>
          <p className="text-[15px] text-[#E8EEF8] mt-3">All clear</p>
          <p className="text-[13px] text-[#4B5A7A]">Nothing needs your attention right now</p>
        </div>
      )}
    </div>
  )
}
