import { ReasoningStats } from '@/components/reasoning/ReasoningStats'
import { CalibrationChart } from '@/components/reasoning/CalibrationChart'
import { TraceLog } from '@/components/reasoning/TraceLog'

export default function ReasoningPage() {
  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      <header className="mb-6">
        <h1 className="text-[24px] font-semibold text-[#E6EAF4]">Reasoning</h1>
        <p className="text-[12px] text-[#8A9BB8] mt-1">
          Every AI decision, step by step. Filter by step, confidence band, category, or cluster.
        </p>
      </header>

      <ReasoningStats />
      <CalibrationChart />
      <TraceLog />
    </div>
  )
}
