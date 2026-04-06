'use client'

import { useState } from 'react'
import { ReportFeed } from '@/components/briefings/ReportFeed'
import { ScheduleTab } from '@/components/briefings/ScheduleTab'

export default function BriefingsPage() {
  const [tab, setTab] = useState<'schedule' | 'reports'>('schedule')

  return (
    <div className="flex flex-col h-[calc(100vh-80px)] px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#E8EEF8]">Briefings & Reports</h1>
          <span className="flex items-center gap-1.5 text-[10px] text-[#4BF2A2]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#4BF2A2] animate-pulse" />
            LIVE
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-4">
        <button onClick={() => setTab('schedule')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'schedule' ? 'bg-[#F2784B]/10 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8] hover:bg-[#111D30]'
          }`}>
          📋 Schedule
        </button>
        <button onClick={() => setTab('reports')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
            tab === 'reports' ? 'bg-[#F2784B]/10 text-[#F2784B]' : 'text-[#4B5A7A] hover:text-[#8A9BB8] hover:bg-[#111D30]'
          }`}>
          📄 Reports
        </button>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto">
        {tab === 'schedule' ? <ScheduleTab /> : <ReportFeed />}
      </div>
    </div>
  )
}
