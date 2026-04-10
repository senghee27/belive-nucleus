import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const filter = req.nextUrl.searchParams.get('filter') ?? 'all'
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '50')

    let query = supabaseAdmin
      .from('proposal_revisions')
      .select('id, incident_id, version_number, outcome, decided_at, feedback_tags, incidents!inner(id, title, cluster, category)')
      .eq('is_final', true)
      .order('decided_at', { ascending: false })
      .limit(Math.min(limit, 200))

    if (filter === 'edited') {
      query = query.in('outcome', ['edited'])
    } else if (filter === 'discarded') {
      query = query.eq('outcome', 'discarded')
    } else if (filter === 'approved') {
      query = query.eq('outcome', 'approved')
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    const log = (data ?? []).map((row: Record<string, unknown>) => {
      const incident = row.incidents as { id: string; title: string; cluster: string | null; category: string }
      return {
        id: row.id,
        incident_id: incident.id,
        title: incident.title,
        cluster: incident.cluster,
        category: incident.category,
        version_number: row.version_number,
        outcome: row.outcome,
        decided_at: row.decided_at,
        feedback_tags: row.feedback_tags ?? [],
      }
    })

    return NextResponse.json({ ok: true, log })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
