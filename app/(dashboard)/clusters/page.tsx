import { getAllClusterHealth } from '@/lib/cluster-health'
import { ClusterHealthWall } from '@/components/clusters/ClusterHealthWall'

export const dynamic = 'force-dynamic'

export default async function ClustersPage() {
  const clusters = await getAllClusterHealth()
  return <ClusterHealthWall initialClusters={clusters} />
}
