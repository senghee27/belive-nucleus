import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('scan_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, logs: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
