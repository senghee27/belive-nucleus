import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data: report } = await supabaseAdmin
      .from('briefing_reports')
      .select('content_original')
      .eq('id', id)
      .single()

    if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await supabaseAdmin
      .from('briefing_reports')
      .update({ content: report.content_original, lee_edited: false })
      .eq('id', id)

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
