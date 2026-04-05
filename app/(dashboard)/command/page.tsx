import { getIncidents, getIncidentStats } from '@/lib/incidents'
import { CommandCenter } from '@/components/command/CommandCenter'

export const dynamic = 'force-dynamic'

export default async function CommandPage() {
  const [incidents, stats] = await Promise.all([
    getIncidents({ limit: 100 }),
    getIncidentStats(),
  ])
  return <CommandCenter initialIncidents={incidents} initialStats={stats} />
}
