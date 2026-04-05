import { getIncidents, getIncidentStats } from '@/lib/incidents'
import { CommandCenter } from '@/components/command/CommandCenter'

export const dynamic = 'force-dynamic'

export default async function CommandPage() {
  const [incidents, stats] = await Promise.all([
    getIncidents({ status: ['new', 'analysed', 'awaiting_lee', 'acting'], limit: 50 }),
    getIncidentStats(),
  ])
  return <CommandCenter initialIncidents={incidents} initialStats={stats} />
}
