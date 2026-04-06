'use client'

import { Wrench, Sparkles, LogIn, RefreshCw, MessageSquare, RotateCw, Check, AlertCircle } from 'lucide-react'
import type { ClusterHealth } from '@/lib/types'

export type ClusterScanState = 'idle' | 'scanning' | 'done' | 'error'

const STATUS_GLOW: Record<string, string> = {
  red: 'shadow-[0_0_20px_rgba(224,82,82,0.4)]',
  amber: 'shadow-[0_0_12px_rgba(232,168,56,0.2)]',
  green: 'shadow-[0_0_8px_rgba(75,242,162,0.1)]',
}

const STATUS_BORDER: Record<string, string> = {
  red: 'border-[#E05252]', amber: 'border-[#E8A838]', green: 'border-[#1A2035]',
}

const STATUS_DOT: Record<string, string> = {
  red: '#E05252', amber: '#E8A838', green: '#4BF2A2',
}

export function ClusterColumn({ cluster: c, color, selected, onClick, scanState = 'idle', onScan }: {
  cluster: ClusterHealth; color: string; selected: boolean; onClick: () => void
  scanState?: ClusterScanState; onScan?: (cluster: string) => void
}) {
  const silentLabel = c.cluster_silent_hours < 1 ? `${Math.round(c.cluster_silent_hours * 60)}m`
    : c.cluster_silent_hours < 24 ? `${Math.round(c.cluster_silent_hours)}h`
    : `${Math.round(c.cluster_silent_hours / 24)}d`

  return (
    <button onClick={onClick}
      className={`w-[160px] shrink-0 bg-[#0D1525] border rounded-xl p-3 flex flex-col transition-all ${
        selected ? 'border-[#F2784B] scale-[1.02]' : STATUS_BORDER[c.health_status]
      } ${STATUS_GLOW[c.health_status]} hover:scale-[1.01] ${
        scanState === 'scanning' ? 'border-[#4BB8F2] animate-pulse' : ''
      } ${scanState === 'done' ? 'border-[#4BF2A2]' : ''}`}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2.5 h-2.5 rounded-full ${c.health_status === 'red' ? 'animate-pulse' : ''}`}
          style={{ backgroundColor: STATUS_DOT[c.health_status] }} />
        <span className="text-sm font-bold flex-1" style={{ color }}>{c.cluster}</span>
        {onScan && (
          <span
            onClick={(e) => { e.stopPropagation(); if (scanState === 'idle' || scanState === 'done' || scanState === 'error') onScan(c.cluster) }}
            className={`flex items-center justify-center w-5 h-5 rounded-md transition-colors ${
              scanState === 'scanning' ? 'text-[#4BB8F2]' :
              scanState === 'done' ? 'text-[#4BF2A2]' :
              scanState === 'error' ? 'text-[#E05252]' :
              'text-[#2A3550] hover:text-[#4BB8F2] hover:bg-[#111D30]'
            }`}>
            {scanState === 'scanning' ? <RotateCw size={11} className="animate-spin" /> :
             scanState === 'done' ? <Check size={11} /> :
             scanState === 'error' ? <AlertCircle size={11} /> :
             <RotateCw size={11} />}
          </span>
        )}
      </div>
      <p className="text-[10px] text-[#4B5A7A] mb-1">{c.cluster_name}</p>
      <p className="text-lg font-bold font-[family-name:var(--font-jetbrains-mono)] mb-3"
        style={{ color: STATUS_DOT[c.health_status] }}>{c.health_score}</p>

      {/* Categories */}
      <div className="space-y-1.5 flex-1">
        <CategoryRow icon={Wrench} label="Maint" total={c.maintenance_total}
          overdue={c.maintenance_overdue} active={c.maintenance_active} silent={c.maintenance_silent} />
        <CategoryRow icon={Sparkles} label="Clean" total={c.cleaning_total}
          overdue={c.cleaning_overdue} active={c.cleaning_active} silent={c.cleaning_silent} />
        <CategoryRow icon={LogIn} label="In" total={c.move_in_pending}
          overdue={c.move_in_overdue} />
        <TurnaroundRow total={c.turnaround_total}
          warning={c.turnaround_warning} breach={c.turnaround_breach} maxDays={c.turnaround_max_days} />
      </div>

      {/* Last activity + compliance */}
      <div className="mt-2 pt-2 border-t border-[#1A2035] space-y-1">
        <div className="flex items-center gap-1">
          <MessageSquare size={10} className="text-[#4B5A7A]" />
          <span className={`text-[9px] ${c.cluster_silent_hours > 24 ? 'text-[#E05252]' : c.cluster_silent_hours > 12 ? 'text-[#E8A838]' : 'text-[#4B5A7A]'}`}>
            {silentLabel} {c.cluster_silent_hours > 12 ? '⚠️' : ''}
          </span>
        </div>
        {c.today_compliance && (
          <div className="flex items-center gap-1">
            <span className={`text-[9px] ${
              c.today_compliance === 'compliant' ? 'text-[#4BF2A2]' :
              c.today_compliance === 'reminder_sent' ? 'text-[#E8A838]' :
              c.today_compliance === 'non_compliant' ? 'text-[#E05252] animate-pulse' : 'text-[#4B5A7A]'
            }`}>
              {c.today_compliance === 'compliant' ? '📋 ✅' :
               c.today_compliance === 'reminder_sent' ? '📋 ⏳' :
               c.today_compliance === 'non_compliant' ? '📋 ❌' : '📋 ⏳'}
            </span>
          </div>
        )}
      </div>
    </button>
  )
}

function CategoryRow({ icon: Icon, label, total, overdue, active, silent }: {
  icon: React.ElementType; label: string; total: number; overdue?: number; active?: number; silent?: number
}) {
  const color = (overdue ?? 0) > 0 ? '#E05252' : (silent ?? 0) > 0 ? '#9B6DFF' : total === 0 ? '#4B5A7A' : '#4BF2A2'
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <Icon size={10} style={{ color }} />
        <span className="text-[9px] text-[#4B5A7A]">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{total}</span>
        {(overdue ?? 0) > 0 && <span className="text-[8px] text-[#E05252]">{overdue}!</span>}
        {(active ?? 0) > 0 && <span className="text-[8px] text-[#4BB8F2]">{active}↑</span>}
      </div>
    </div>
  )
}

function TurnaroundRow({ total, warning, breach, maxDays }: {
  total: number; warning: number; breach: number; maxDays: number
}) {
  const color = breach > 0 ? '#E05252' : warning > 0 ? '#E8A838' : total === 0 ? '#4B5A7A' : '#4BF2A2'
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1">
        <RefreshCw size={10} style={{ color }} />
        <span className="text-[9px] text-[#4B5A7A]">Turn</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[10px] font-[family-name:var(--font-jetbrains-mono)]" style={{ color }}>{total}</span>
        {breach > 0 && <span className="text-[8px] text-[#E05252]">D{Math.round(maxDays)}</span>}
        {warning > 0 && breach === 0 && <span className="text-[8px] text-[#E8A838]">D{Math.round(maxDays)}</span>}
      </div>
    </div>
  )
}
