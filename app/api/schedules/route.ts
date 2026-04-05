import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getNextRunTime } from '@/lib/scheduler'
import type { ScanSchedule } from '@/lib/scheduler'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('scan_schedules')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) throw new Error(error.message)

    // Calculate next_run_at for each
    const schedules = (data ?? []).map(s => ({
      ...s,
      next_run_at: s.next_run_at ?? getNextRunTime(s as ScanSchedule)?.toISOString() ?? null,
    }))

    return NextResponse.json({ ok: true, schedules })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Name required' }, { status: 400 })
    }

    const schedule = {
      name: body.name,
      description: body.description ?? null,
      agent: body.agent ?? 'coo',
      group_ids: body.group_ids ?? [],
      frequency: body.frequency ?? 'daily',
      days_of_week: body.days_of_week ?? null,
      time_myt: body.time_myt ?? null,
      skill: body.skill ?? 'general_scan',
      custom_prompt: body.custom_prompt ?? null,
      output_actions: body.output_actions ?? ['detect_issues'],
    }

    const nextRun = getNextRunTime(schedule as ScanSchedule)

    const { data, error } = await supabaseAdmin
      .from('scan_schedules')
      .insert({ ...schedule, next_run_at: nextRun?.toISOString() ?? null })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, schedule: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
