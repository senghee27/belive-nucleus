import { getAllGroups } from '@/lib/monitored-groups'
import { GroupsManager } from '@/components/groups/GroupsManager'

export const dynamic = 'force-dynamic'

export default async function GroupsPage() {
  const groups = await getAllGroups()
  return <GroupsManager initialGroups={groups} />
}
