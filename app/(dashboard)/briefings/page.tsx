import { ReportFeed } from '@/components/briefings/ReportFeed'

export default function BriefingsPage() {
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
      <ReportFeed />
    </div>
  )
}
