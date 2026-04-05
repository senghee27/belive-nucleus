import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { scanTestClusters } from '@/lib/lark-groups'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const results = await scanTestClusters()
    return NextResponse.json({ ok: true, ...results })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[scan:route]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { data: messages } = await supabaseAdmin
      .from('lark_group_messages')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    const { data: issueCounts } = await supabaseAdmin
      .from('lark_issues')
      .select('cluster')
      .eq('status', 'open')

    const countsByCluster: Record<string, number> = {}
    for (const row of issueCounts ?? []) {
      countsByCluster[row.cluster] = (countsByCluster[row.cluster] ?? 0) + 1
    }

    return NextResponse.json({
      ok: true,
      recentMessages: messages ?? [],
      issueCounts: countsByCluster,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[scan:get]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
