import { WarRoomWall } from '@/components/clusters/war-room/WarRoomWall'

export const dynamic = 'force-dynamic'

export default function ClustersPage() {
  return (
    <div className="h-[calc(100vh-100px)] min-h-0">
      <WarRoomWall />
    </div>
  )
}
