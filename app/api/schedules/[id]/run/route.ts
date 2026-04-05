import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { executeSchedule, updateScheduleAfterRun } from '@/lib/scheduler'
import type { ScanSchedule } from '@/lib/scheduler'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = await params
    const { data: schedule, error } = await supabaseAdmin
      .from('scan_schedules')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !schedule) {
      return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    }

    const result = await executeSchedule(schedule as ScanSchedule)
    await updateScheduleAfterRun(id, result.issues_found >= 0 ? 'success' : 'failed', result.summary)

    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
