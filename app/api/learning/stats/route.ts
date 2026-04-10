import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('category_learning_stats')
      .select('*')

    if (error) throw new Error(error.message)

    const totals = (data ?? []).reduce(
      (acc, cat) => ({
        total: acc.total + (cat.total_proposals ?? 0),
        approvedV1: acc.approvedV1 + (cat.approved_v1 ?? 0),
        approvedEdited: acc.approvedEdited + (cat.approved_edited ?? 0),
        discarded: acc.discarded + (cat.discarded ?? 0),
      }),
      { total: 0, approvedV1: 0, approvedEdited: 0, discarded: 0 }
    )

    return NextResponse.json({
      ok: true,
      ...totals,
      acceptanceRate: totals.total > 0 ? Math.round((totals.approvedV1 / totals.total) * 1000) / 10 : 0,
      editRate: totals.total > 0 ? Math.round((totals.approvedEdited / totals.total) * 1000) / 10 : 0,
      discardRate: totals.total > 0 ? Math.round((totals.discarded / totals.total) * 1000) / 10 : 0,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
