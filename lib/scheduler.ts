import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendMorningBriefings } from '@/lib/briefings/morning'
import { scanEnabledGroups } from '@/lib/scanner'

export type ScanSchedule = {
  id: string
  name: string
  description: string | null
  agent: string
  group_ids: string[]
  enabled: boolean
  frequency: string
  days_of_week: number[] | null
  time_myt: string | null
  skill: string
  custom_prompt: string | null
  output_actions: string[]
  last_run_at: string | null
  last_run_status: string | null
  last_run_summary: string | null
  total_runs: number
  next_run_at: string | null
}

export type ScheduleRunResult = {
  groups_scanned: number
  messages_read: number
  issues_found: number
  briefings_sent: number
  summary: string
}

export async function getSchedulesDueNow(): Promise<ScanSchedule[]> {
  try {
    // Get current MYT time
    const now = new Date()
    const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000)
    const currentHour = myt.getUTCHours()
    const currentMin = myt.getUTCMinutes()
    const currentDay = myt.getUTCDay()
    const timeStr = `${String(currentHour).padStart(2, '0')}:${String(currentMin).padStart(2, '0')}`

    const { data: schedules } = await supabaseAdmin
      .from('scan_schedules')
      .select('*')
      .eq('enabled', true)

    if (!schedules) return []

    return schedules.filter(s => {
      if (s.frequency === 'manual') return false

      if (s.frequency === 'daily' && s.time_myt) {
        const [h, m] = s.time_myt.split(':').map(Number)
        const [ch, cm] = timeStr.split(':').map(Number)
        const diff = Math.abs((h * 60 + m) - (ch * 60 + cm))
        if (diff > 7) return false // ±7 min window

        if (s.days_of_week && s.days_of_week.length > 0) {
          if (!s.days_of_week.includes(currentDay)) return false
        }
        return true
      }

      return false
    }) as ScanSchedule[]
  } catch (error) {
    console.error('[scheduler:getDue]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export function getNextRunTime(schedule: ScanSchedule): Date | null {
  if (!schedule.time_myt || schedule.frequency === 'manual') return null

  const [h, m] = schedule.time_myt.split(':').map(Number)
  const now = new Date()
  const myt = new Date(now.getTime() + 8 * 60 * 60 * 1000)

  // Start from today
  const next = new Date(myt)
  next.setUTCHours(h, m, 0, 0)

  // If today's time has passed, start from tomorrow
  if (next <= myt) next.setUTCDate(next.getUTCDate() + 1)

  // Find next valid day
  if (schedule.days_of_week && schedule.days_of_week.length > 0) {
    for (let i = 0; i < 7; i++) {
      if (schedule.days_of_week.includes(next.getUTCDay())) break
      next.setUTCDate(next.getUTCDate() + 1)
    }
  }

  // Convert back to UTC
  return new Date(next.getTime() - 8 * 60 * 60 * 1000)
}

export async function updateScheduleAfterRun(
  scheduleId: string,
  status: 'success' | 'failed' | 'partial',
  summary: string
): Promise<void> {
  const { data: schedule } = await supabaseAdmin
    .from('scan_schedules')
    .select('*')
    .eq('id', scheduleId)
    .single()

  const nextRun = schedule ? getNextRunTime(schedule as ScanSchedule) : null

  await supabaseAdmin
    .from('scan_schedules')
    .update({
      last_run_at: new Date().toISOString(),
      last_run_status: status,
      last_run_summary: summary,
      total_runs: (schedule?.total_runs ?? 0) + 1,
      next_run_at: nextRun?.toISOString() ?? null,
    })
    .eq('id', scheduleId)
}

export async function executeSchedule(schedule: ScanSchedule): Promise<ScheduleRunResult> {
  const result: ScheduleRunResult = {
    groups_scanned: 0, messages_read: 0, issues_found: 0, briefings_sent: 0, summary: '',
  }

  try {
    // Get groups for this schedule
    let groups: { id: string; chat_id: string; cluster: string; context: string | null; group_name: string }[] = []

    if (schedule.group_ids.length > 0) {
      const { data } = await supabaseAdmin
        .from('monitored_groups')
        .select('id, chat_id, cluster, context, group_name')
        .in('id', schedule.group_ids)
      groups = data ?? []
    } else {
      // If no groups assigned, use all enabled groups
      const { data } = await supabaseAdmin
        .from('monitored_groups')
        .select('id, chat_id, cluster, context, group_name')
        .eq('scanning_enabled', true)
      groups = data ?? []
    }

    result.groups_scanned = groups.length

    if (schedule.skill === 'morning_briefing') {
      const briefingResults = await sendMorningBriefings()
      result.briefings_sent = 1
      result.summary = `Morning briefing report created: ${briefingResults.report_id}`
    } else {
      // Use unified scanner
      const scanResult = await scanEnabledGroups()
      result.groups_scanned = scanResult.groups_scanned
      result.messages_read = scanResult.total_messages
      result.issues_found = scanResult.total_incidents
      result.summary = `Scanned ${result.groups_scanned} groups, ${result.messages_read} msgs, ${result.issues_found} incidents`
    }

    return result
  } catch (error) {
    console.error('[scheduler:execute]', error instanceof Error ? error.message : 'Unknown')
    result.summary = `Error: ${error instanceof Error ? error.message : 'Unknown'}`
    return result
  }
}
