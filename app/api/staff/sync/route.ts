import { NextRequest, NextResponse } from 'next/server'
import { syncStaffFromLark, syncStaffFromGroups } from '@/lib/staff-directory'

export async function GET(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Run both sync strategies:
    // 1. Tenant token via contact API — catches internal org users
    // 2. Lee's user token via group members — catches all users in monitored groups
    //    (including external/privacy-restricted users the bot can't see)
    const tenantResult = await syncStaffFromLark()
    const groupResult = await syncStaffFromGroups()

    return NextResponse.json({
      ok: true,
      tenant: tenantResult,
      groups: groupResult,
      total_synced: tenantResult.synced + groupResult.synced,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
