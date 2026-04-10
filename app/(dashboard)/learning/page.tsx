import { LearningDashboard } from '@/components/learning/LearningDashboard'

export default function LearningPage() {
  return (
    <div className="px-6 py-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-[#E8EEF8]">Learning</h1>
          <span className="text-[10px] text-[#9B6DFF] bg-[#9B6DFF]/10 px-2 py-0.5 rounded-full">Proposal Learning Engine</span>
        </div>
      </div>
      <LearningDashboard />
    </div>
  )
}
