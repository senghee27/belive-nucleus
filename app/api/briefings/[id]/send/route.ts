import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendReport } from '@/lib/briefings/report-generator'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    // Optionally override destinations
    if (body.destinations && Array.isArray(body.destinations)) {
      const { data: report } = await supabaseAdmin
        .from('briefing_reports')
        .select('destinations')
        .eq('id', id)
        .single()

      if (report) {
        const updated = (report.destinations as { chat_id: string; selected: boolean }[]).map(d => ({
          ...d,
          selected: body.destinations.includes(d.chat_id),
        }))
        await supabaseAdmin.from('briefing_reports').update({ destinations: updated }).eq('id', id)
      }
    }

    await sendReport(id, false)

    const { data: sent } = await supabaseAdmin
      .from('briefing_reports')
      .select('sent_to, status, send_error')
      .eq('id', id)
      .single()

    return NextResponse.json({
      ok: true,
      sent_to: sent?.sent_to ?? [],
      success: sent?.status === 'sent',
      error: sent?.send_error,
    })
  } catch (error) {
    console.error('[api:briefings:send]', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
