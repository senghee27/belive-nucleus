import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getClusterTicketDetails } from '@/lib/cluster-health'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ cluster: string }> }) {
  try {
    const { cluster } = await params
    const { data: health } = await supabaseAdmin.from('cluster_health_cache').select('*').eq('cluster', cluster).single()
    const tickets = await getClusterTicketDetails(cluster)
    return NextResponse.json({ ok: true, health, tickets })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
