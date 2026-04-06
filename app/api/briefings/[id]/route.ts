import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data, error } = await supabaseAdmin
      .from('briefing_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ ok: true, report: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { content } = body

    if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('briefing_reports')
      .update({ content, lee_edited: true })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, report: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await supabaseAdmin
      .from('briefing_reports')
      .update({ status: 'discarded' })
      .eq('id', id)

    if (error) throw new Error(error.message)

    // Reset confidence on discard
    const { data: report } = await supabaseAdmin
      .from('briefing_reports')
      .select('report_type')
      .eq('id', id)
      .single()

    if (report) {
      const { resetConfidenceOnDiscard } = await import('@/lib/briefings/confidence')
      await resetConfidenceOnDiscard(report.report_type as string)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
