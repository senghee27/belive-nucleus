import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params

    const { data: config, error } = await supabaseAdmin
      .from('briefing_schedule_config')
      .select('*')
      .eq('report_type', type)
      .single()

    if (error || !config) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Get last 30 runs
    let runsQuery = supabaseAdmin
      .from('briefing_cron_runs')
      .select('*')
      .eq('report_type', type)
      .order('started_at', { ascending: false })
      .limit(30)

    const { data: runs } = await runsQuery

    return NextResponse.json({ ok: true, config, runs: runs ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ type: string }> }
) {
  try {
    const { type } = await params
    const body = await req.json()

    const updates: Record<string, unknown> = {}
    if (typeof body.enabled === 'boolean') updates.enabled = body.enabled

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('briefing_schedule_config')
      .update(updates)
      .eq('report_type', type)

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
