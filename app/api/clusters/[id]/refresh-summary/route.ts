import { NextRequest, NextResponse } from 'next/server'
import { enrichClusterHealthCache } from '@/lib/clusters/generate-cluster-summary'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    await enrichClusterHealthCache(id)

    const { data } = await supabaseAdmin
      .from('cluster_health_cache')
      .select('ai_summary, ai_summary_generated_at')
      .eq('cluster', id)
      .single()

    return NextResponse.json({
      ok: true,
      ai_summary: data?.ai_summary,
      generated_at: data?.ai_summary_generated_at,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
