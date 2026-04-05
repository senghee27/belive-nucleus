import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cluster: string; date: string }> }
) {
  try {
    const { cluster, date } = await params

    const { data: session } = await supabaseAdmin
      .from('standup_sessions')
      .select('*')
      .eq('session_date', date)
      .eq('cluster', cluster)
      .single()

    const { data: messages } = await supabaseAdmin
      .from('daily_messages')
      .select('*')
      .eq('cluster', cluster)
      .eq('session_date', date)
      .order('created_at', { ascending: true })

    return NextResponse.json({ ok: true, session, messages: messages ?? [] })
  } catch (error) {
    return NextResponse.json({ ok: true, session: null, messages: [] })
  }
}
