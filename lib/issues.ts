import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendGroupMessage } from '@/lib/lark-groups'
import { sendLarkMessage } from '@/lib/lark'

const ESCALATION_HOURS: Record<string, number> = { P1: 2, P2: 24, P3: 48 }

export const CLUSTER_COLORS: Record<string, string> = {
  C1: '#F2784B', C2: '#9B6DFF', C3: '#4BB8F2',
  C4: '#4BF2A2', C5: '#E8A838', C6: '#F27BAD',
  C7: '#6DD5F2', C8: '#B46DF2', C9: '#F2C96D',
  C10: '#6DF2B4', C11: '#E05252',
}

export type Issue = {
  id: string
  created_at: string
  updated_at: string
  cluster: string
  chat_id: string
  title: string
  severity: string
  status: string
  priority: string
  owner_name: string | null
  owner_open_id: string | null
  last_activity: string | null
  days_open: number
  source_message_id: string | null
  decision_id: string | null
  notes: string | null
  escalation_due_at: string | null
  escalated: boolean
  follow_up_count: number
  last_follow_up_at: string | null
  resolved_at: string | null
  resolved_by: string | null
  cluster_color: string | null
  thread_keywords: string[] | null
  last_message_at: string | null
  silence_hours: number | null
  ai_summary: string | null
  ai_summary_at: string | null
  message_count: number
  has_lee_replied: boolean
}

export type IssueStats = {
  total: number
  red: number
  yellow: number
  green: number
  overdue: number
  byCluster: Record<string, { red: number; yellow: number; green: number }>
}

type CreateIssueInput = {
  cluster: string
  chat_id: string
  title: string
  severity: string
  priority?: string
  owner_name?: string | null
  owner_open_id?: string | null
  source_message_id?: string | null
}

export async function getOpenIssues(clusters?: string[]): Promise<Issue[]> {
  try {
    let query = supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('status', 'open')
      .order('created_at', { ascending: true })

    if (clusters && clusters.length > 0) {
      query = query.in('cluster', clusters)
    }

    const { data, error } = await query
    if (error) throw new Error(error.message)

    return (data ?? []).map(d => ({
      ...d,
      days_open: Math.floor((Date.now() - new Date(d.created_at).getTime()) / (1000 * 60 * 60 * 24)),
    }))
  } catch (error) {
    console.error('[issues:getOpen]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export async function getIssueStats(): Promise<IssueStats> {
  try {
    const { data } = await supabaseAdmin
      .from('lark_issues')
      .select('severity, cluster, escalation_due_at, escalated')
      .eq('status', 'open')

    const issues = data ?? []
    const now = Date.now()
    const stats: IssueStats = {
      total: issues.length,
      red: issues.filter(i => i.severity === 'RED').length,
      yellow: issues.filter(i => i.severity === 'YELLOW').length,
      green: issues.filter(i => i.severity === 'GREEN').length,
      overdue: issues.filter(i => i.escalation_due_at && new Date(i.escalation_due_at).getTime() < now && !i.escalated).length,
      byCluster: {},
    }

    for (const issue of issues) {
      if (!stats.byCluster[issue.cluster]) {
        stats.byCluster[issue.cluster] = { red: 0, yellow: 0, green: 0 }
      }
      const sev = issue.severity?.toLowerCase() as 'red' | 'yellow' | 'green'
      if (sev in stats.byCluster[issue.cluster]) {
        stats.byCluster[issue.cluster][sev]++
      }
    }

    return stats
  } catch (error) {
    console.error('[issues:stats]', error instanceof Error ? error.message : 'Unknown')
    return { total: 0, red: 0, yellow: 0, green: 0, overdue: 0, byCluster: {} }
  }
}

export async function createIssue(input: CreateIssueInput): Promise<Issue | null> {
  try {
    const priority = input.priority ?? (input.severity === 'RED' ? 'P1' : input.severity === 'YELLOW' ? 'P2' : 'P3')
    const hours = ESCALATION_HOURS[priority] ?? 48
    const escalationDue = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString()

    const { data, error } = await supabaseAdmin
      .from('lark_issues')
      .insert({
        ...input,
        priority,
        escalation_due_at: escalationDue,
        cluster_color: CLUSTER_COLORS[input.cluster] ?? '#4B5A7A',
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return { ...data, days_open: 0 }
  } catch (error) {
    console.error('[issues:create]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function resolveIssue(issueId: string, resolvedBy: string): Promise<void> {
  try {
    await supabaseAdmin
      .from('lark_issues')
      .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: resolvedBy })
      .eq('id', issueId)
  } catch (error) {
    console.error('[issues:resolve]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function escalateIssue(issueId: string): Promise<void> {
  try {
    const { data: issue } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('id', issueId)
      .single()

    if (!issue) return

    const newSeverity = issue.severity === 'GREEN' ? 'YELLOW' : 'RED'
    const newPriority = newSeverity === 'RED' ? 'P1' : 'P2'

    await supabaseAdmin
      .from('lark_issues')
      .update({
        severity: newSeverity,
        priority: newPriority,
        escalated: true,
        follow_up_count: (issue.follow_up_count ?? 0) + 1,
        last_follow_up_at: new Date().toISOString(),
      })
      .eq('id', issueId)

    await supabaseAdmin.from('issue_follow_ups').insert({
      issue_id: issueId,
      follow_up_type: 'auto_escalate',
      message_sent: `Auto-escalated from ${issue.severity} to ${newSeverity}`,
      sent_to_chat_id: issue.chat_id,
    })
  } catch (error) {
    console.error('[issues:escalate]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function checkAndEscalateOverdueIssues(): Promise<{ escalated: number; issues: Issue[] }> {
  try {
    const { data } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('status', 'open')
      .eq('escalated', false)
      .lt('escalation_due_at', new Date().toISOString())

    const overdueIssues = data ?? []

    for (const issue of overdueIssues) {
      await escalateIssue(issue.id)
    }

    if (overdueIssues.length > 0) {
      const dmText = formatIssueDMForLee(overdueIssues)
      const leeId = process.env.LEE_LARK_CHAT_ID
      if (leeId) {
        await sendLarkMessage(leeId, dmText, 'open_id')
      }
    }

    return {
      escalated: overdueIssues.length,
      issues: overdueIssues.map(d => ({ ...d, days_open: Math.floor((Date.now() - new Date(d.created_at).getTime()) / 86400000) })),
    }
  } catch (error) {
    console.error('[issues:checkEscalation]', error instanceof Error ? error.message : 'Unknown')
    return { escalated: 0, issues: [] }
  }
}

export function formatIssueDMForLee(issues: Issue[]): string {
  const red = issues.filter(i => i.severity === 'RED' || i.escalated)
  const lines = ['⚠️ Escalated Issues\n']

  for (const i of red.slice(0, 5)) {
    const age = i.days_open ?? Math.floor((Date.now() - new Date(i.created_at).getTime()) / 86400000)
    lines.push(`🔴 ${i.cluster} — ${i.title} (${age}d) — ${i.owner_name ?? 'Unassigned'}`)
  }

  if (issues.length > 5) lines.push(`...and ${issues.length - 5} more`)
  lines.push('\nView: https://belive-nucleus.vercel.app/issues')

  return lines.join('\n')
}

export async function sendFollowUpToGroup(issueId: string, message: string): Promise<boolean> {
  try {
    const { data: issue } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('id', issueId)
      .single()

    if (!issue) return false

    const chatId = issue.chat_id
    const msgId = await sendGroupMessage(chatId, message, false)

    await supabaseAdmin
      .from('lark_issues')
      .update({
        follow_up_count: (issue.follow_up_count ?? 0) + 1,
        last_follow_up_at: new Date().toISOString(),
      })
      .eq('id', issueId)

    await supabaseAdmin.from('issue_follow_ups').insert({
      issue_id: issueId,
      follow_up_type: 'manual',
      message_sent: message,
      sent_to_chat_id: chatId,
    })

    return msgId !== null
  } catch (error) {
    console.error('[issues:followUp]', error instanceof Error ? error.message : 'Unknown')
    return false
  }
}
