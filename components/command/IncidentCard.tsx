'use client'

import type { Incident } from '@/lib/types'
import { formatDistanceToNow } from 'date-fns'

const SEV_COLORS: Record<string, string> = { RED: '#E05252', YELLOW: '#E8A838', GREEN: '#4BF2A2' }
const STATUS_COLORS: Record<string, string> = { new: '#E05252', analysed: '#9B6DFF', awaiting_lee: '#E8A838', acting: '#4BB8F2' }
const CLUSTER_COLORS: Record<string, string> = { C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2', C4: '#4BF2A2', C5: '#E8A838', C6: '#F27BAD', C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D', C10: '#6DF2B4', C11: '#E05252' }
const AGENT_COLORS: Record<string, string> = { ceo: '#9B6DFF', cfo: '#4BB8F2', coo: '#F2784B', cto: '#4BF2A2' }

export function IncidentCard({ incident, selected, onClick }: { incident: Incident; selected: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`w-full text-left bg-[#0D1525] border rounded-xl p-3 transition-colors relative overflow-hidden ${selected ? 'border-[#F2784B] bg-[#0F1829]' : 'border-[#1A2035] hover:border-[#243050]'}`}>
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: STATUS_COLORS[incident.status] ?? '#4B5A7A' }} />

      <div className="pl-2 flex items-center gap-1.5 mb-1.5 flex-wrap">
        <span className={`w-2 h-2 rounded-full ${incident.severity === 'RED' ? 'animate-pulse' : ''}`} style={{ backgroundColor: SEV_COLORS[incident.severity] }} />
        {incident.cluster && <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: CLUSTER_COLORS[incident.cluster] ?? '#8A9BB8', backgroundColor: (CLUSTER_COLORS[incident.cluster] ?? '#8A9BB8') + '15' }}>{incident.cluster}</span>}
        <span className="text-[9px] px-1 py-0.5 rounded" style={{ color: AGENT_COLORS[incident.agent] ?? '#8A9BB8', backgroundColor: (AGENT_COLORS[incident.agent] ?? '#8A9BB8') + '15' }}>{incident.agent.toUpperCase()}</span>
        <span className="text-[9px] px-1 py-0.5 rounded-full" style={{ color: incident.priority === 'P1' ? '#E05252' : incident.priority === 'P2' ? '#E8A838' : '#4B5A7A', backgroundColor: (incident.priority === 'P1' ? '#E05252' : incident.priority === 'P2' ? '#E8A838' : '#4B5A7A') + '15' }}>{incident.priority}</span>
        <span className="text-[9px] text-[#2A3550] ml-auto">{formatDistanceToNow(new Date(incident.created_at), { addSuffix: true })}</span>
      </div>

      <p className="pl-2 text-sm text-[#E8EEF8] line-clamp-1 mb-1">{incident.title}</p>
      <p className="pl-2 text-[10px] text-[#4B5A7A] line-clamp-1">{incident.raw_content.slice(0, 100)}</p>

      {incident.ai_proposal && (
        <p className="pl-2 text-[10px] text-[#F2784B] mt-1 line-clamp-1">→ {incident.ai_proposal.slice(0, 80)}</p>
      )}

      {incident.ai_confidence > 0 && (
        <div className="pl-2 flex items-center gap-1.5 mt-1.5">
          <div className="w-16 h-1 rounded-full bg-[#1A2035] overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${incident.ai_confidence}%`, backgroundColor: incident.ai_confidence >= 85 ? '#4BF2A2' : incident.ai_confidence >= 65 ? '#E8A838' : '#E05252' }} />
          </div>
          <span className="text-[9px] font-[family-name:var(--font-jetbrains-mono)] text-[#4B5A7A]">{incident.ai_confidence}%</span>
        </div>
      )}
    </button>
  )
}
