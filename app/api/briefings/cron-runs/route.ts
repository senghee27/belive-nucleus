import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const p = req.nextUrl.searchParams
    const reportType = p.get('report_type')
    const cluster = p.get('cluster')
    const status = p.get('status')
    const limit = parseInt(p.get('limit') ?? '30')
    const cursor = p.get('cursor')

    let query = supabaseAdmin
      .from('briefing_cron_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(Math.min(limit, 100))

    if (reportType) query = query.eq('report_type', reportType)
    if (cluster) query = query.eq('cluster', cluster)
    if (status) query = query.eq('status', status)
    if (cursor) query = query.lt('started_at', cursor)

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const runs = data ?? []
    const nextCursor = runs.length > 0 ? runs[runs.length - 1].started_at : null

    return NextResponse.json({ ok: true, runs, next_cursor: nextCursor })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
