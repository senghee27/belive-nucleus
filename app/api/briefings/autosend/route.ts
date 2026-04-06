import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('briefing_autosend_config')
      .select('*')
      .order('report_type', { ascending: true })

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, configs: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { report_type, auto_send_enabled } = body

    if (!report_type || typeof auto_send_enabled !== 'boolean') {
      return NextResponse.json({ error: 'Missing report_type or auto_send_enabled' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('briefing_autosend_config')
      .update({ auto_send_enabled })
      .eq('report_type', report_type)

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
