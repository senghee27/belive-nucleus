import { supabaseAdmin } from '@/lib/supabase-admin'

export type MonitoredGroup = {
  id: string
  created_at: string
  updated_at: string
  chat_id: string
  group_name: string
  cluster: string
  cluster_color: string
  location: string | null
  group_type: string
  context: string | null
  agent: string
  scanning_enabled: boolean
  scan_frequency_minutes: number
  last_scanned_at: string | null
  message_count_total: number
  issue_count_total: number
  active_issues: number
  added_by: string
  notes: string | null
}

export async function getActiveGroups(options?: {
  type?: string
  agent?: string
}): Promise<MonitoredGroup[]> {
  try {
    let query = supabaseAdmin
      .from('monitored_groups')
      .select('*')
      .eq('scanning_enabled', true)
      .order('cluster', { ascending: true })

    if (options?.type) query = query.eq('group_type', options.type)
    if (options?.agent) query = query.eq('agent', options.agent)

    const { data, error } = await query
    if (error) throw new Error(error.message)
    return (data ?? []) as MonitoredGroup[]
  } catch (error) {
    console.error('[groups:getActive]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export async function getAllGroups(): Promise<MonitoredGroup[]> {
  try {
    const { data, error } = await supabaseAdmin
      .from('monitored_groups')
      .select('*')
      .order('cluster', { ascending: true })

    if (error) throw new Error(error.message)
    return (data ?? []) as MonitoredGroup[]
  } catch (error) {
    console.error('[groups:getAll]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export async function getGroupByChatId(chatId: string): Promise<MonitoredGroup | null> {
  try {
    const { data } = await supabaseAdmin
      .from('monitored_groups')
      .select('*')
      .eq('chat_id', chatId)
      .single()
    return data as MonitoredGroup | null
  } catch {
    return null
  }
}

export async function updateLastScanned(chatId: string): Promise<void> {
  await supabaseAdmin
    .from('monitored_groups')
    .update({ last_scanned_at: new Date().toISOString() })
    .eq('chat_id', chatId)
}

export async function incrementGroupStats(
  chatId: string,
  messages: number,
  newIssues: number
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('monitored_groups')
    .select('message_count_total, issue_count_total, active_issues')
    .eq('chat_id', chatId)
    .single()

  if (data) {
    await supabaseAdmin
      .from('monitored_groups')
      .update({
        message_count_total: (data.message_count_total ?? 0) + messages,
        issue_count_total: (data.issue_count_total ?? 0) + newIssues,
        active_issues: (data.active_issues ?? 0) + newIssues,
      })
      .eq('chat_id', chatId)
  }
}
