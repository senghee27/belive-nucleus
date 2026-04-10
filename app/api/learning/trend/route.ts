import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('proposal_revisions')
      .select('outcome, version_number, decided_at')
      .eq('is_final', true)
      .gte('decided_at', thirtyDaysAgo)
      .order('decided_at', { ascending: true })

    if (error) throw new Error(error.message)

    const dayMap = new Map<string, { total: number; approved: number }>()
    for (const row of (data ?? []) as Array<{ outcome: string; version_number: number; decided_at: string }>) {
      const day = row.decided_at?.split('T')[0]
      if (!day) continue
      const existing = dayMap.get(day) ?? { total: 0, approved: 0 }
      existing.total++
      if (row.outcome === 'approved' && row.version_number === 1) existing.approved++
      dayMap.set(day, existing)
    }

    const trend = [...dayMap.entries()].map(([date, { total, approved }]) => ({
      date,
      total,
      approved,
      rate: total > 0 ? Math.round((approved / total) * 100) : 0,
    }))

    return NextResponse.json({ ok: true, trend })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
