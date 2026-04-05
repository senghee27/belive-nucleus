import { getOpenIssues, getIssueStats } from '@/lib/issues'
import { IssuesDashboard } from '@/components/issues/IssuesDashboard'

export const dynamic = 'force-dynamic'

export default async function IssuesPage() {
  const [issues, stats] = await Promise.all([
    getOpenIssues(['C1', 'C2', 'C11']),
    getIssueStats(),
  ])

  return <IssuesDashboard initialIssues={issues} initialStats={stats} />
}
