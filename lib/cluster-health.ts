import { supabaseAdmin } from './supabase-admin'
import Anthropic from '@anthropic-ai/sdk'
import type { ClusterHealth } from './types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const MAINT_KEYWORDS = ['repair', 'rosak', 'leaking', 'bocor', 'electric', 'plumbing', 'ac', 'lift', 'door', 'lock', 'water heater', 'pipe', 'ceiling', 'wall', 'aircon', 'lamp', 'light']
const CLEANING_KEYWORDS = ['cleaning', 'clean', 'housekeeping', 'dirty', 'smell', 'stain', 'carpet', 'mop']
const MOVEIN_KEYWORDS = ['move in', 'move-in', 'onboarding', 'handover in', 'tenant onboard', 'vacant possession']
const MOVEOUT_KEYWORDS = ['move out', 'move-out', 'turnaround', 'vacate', 'checkout', 'handover out', 'inspection']

type Category = 'maintenance' | 'cleaning' | 'move_in' | 'move_out'

export function categorizeTicket(issueDesc: string): Category {
  const lower = (issueDesc ?? '').toLowerCase()
  if (MOVEIN_KEYWORDS.some(k => lower.includes(k))) return 'move_in'
  if (MOVEOUT_KEYWORDS.some(k => lower.includes(k))) return 'move_out'
  if (CLEANING_KEYWORDS.some(k => lower.includes(k))) return 'cleaning'
  return 'maintenance'
}

export function getTicketActivityStatus(
  ticket: { sla_overdue: boolean; unit_number: string | null },
  recentMessages: { content: string; message_time: string }[]
): 'active' | 'silent' | 'overdue' | 'healthy' {
  if (ticket.sla_overdue) return 'overdue'

  if (!ticket.unit_number) return 'silent'

  const now = Date.now()
  const unitLower = ticket.unit_number.toLowerCase()

  const mentions = recentMessages.filter(m =>
    m.content.toLowerCase().includes(unitLower)
  )

  if (mentions.length === 0) return 'silent'

  const latestMention = Math.max(...mentions.map(m => new Date(m.message_time).getTime()))
  const hoursSince = (now - latestMention) / 3600000

  if (hoursSince < 6) return 'active'
  if (hoursSince < 24) return 'healthy'
  return 'silent'
}

export async function computeClusterHealth(cluster: string): Promise<void> {
  try {
    // Get tickets for this cluster
    const { data: tickets } = await supabaseAdmin
      .from('ai_report_tickets')
      .select('*')
      .eq('cluster', cluster)
      .eq('status', 'open')

    // Get recent cluster messages (last 48h)
    const since = new Date(Date.now() - 48 * 3600000).toISOString()
    const { data: messages } = await supabaseAdmin
      .from('lark_group_messages')
      .select('content, message_time')
      .eq('cluster', cluster)
      .gte('created_at', since)

    const recentMsgs = messages ?? []
    const allTickets = tickets ?? []

    // Categorize and compute
    const stats = {
      maintenance_total: 0, maintenance_overdue: 0, maintenance_active: 0, maintenance_silent: 0, maintenance_max_age_days: 0,
      cleaning_total: 0, cleaning_overdue: 0, cleaning_active: 0, cleaning_silent: 0, cleaning_max_age_days: 0,
      move_in_pending: 0, move_in_overdue: 0,
      turnaround_total: 0, turnaround_warning: 0, turnaround_breach: 0, turnaround_max_days: 0,
    }

    for (const ticket of allTickets) {
      const cat = categorizeTicket(ticket.issue_description ?? '')
      const activity = getTicketActivityStatus(ticket, recentMsgs)
      const age = ticket.age_days ?? 0

      switch (cat) {
        case 'maintenance':
          stats.maintenance_total++
          if (activity === 'overdue') stats.maintenance_overdue++
          if (activity === 'active') stats.maintenance_active++
          if (activity === 'silent') stats.maintenance_silent++
          stats.maintenance_max_age_days = Math.max(stats.maintenance_max_age_days, age)
          break
        case 'cleaning':
          stats.cleaning_total++
          if (activity === 'overdue') stats.cleaning_overdue++
          if (activity === 'active') stats.cleaning_active++
          if (activity === 'silent') stats.cleaning_silent++
          stats.cleaning_max_age_days = Math.max(stats.cleaning_max_age_days, age)
          break
        case 'move_in':
          stats.move_in_pending++
          if (ticket.sla_overdue) stats.move_in_overdue++
          break
        case 'move_out':
          stats.turnaround_total++
          if (age >= 7) stats.turnaround_breach++
          else if (age >= 4) stats.turnaround_warning++
          stats.turnaround_max_days = Math.max(stats.turnaround_max_days, age)
          break
      }
    }

    // Compute health score
    let score = 100
    score -= Math.min(40, stats.maintenance_overdue * 10)
    score -= Math.min(30, stats.turnaround_breach * 15)
    score -= Math.min(20, stats.turnaround_warning * 10)
    score -= Math.min(40, stats.move_in_overdue * 20)
    score = Math.max(0, score)

    // Last cluster message
    const lastMsg = recentMsgs.length > 0
      ? recentMsgs.reduce((latest, m) => new Date(m.message_time) > new Date(latest.message_time) ? m : latest)
      : null
    const lastMsgTime = lastMsg ? new Date(lastMsg.message_time) : null
    const silentHours = lastMsgTime ? (Date.now() - lastMsgTime.getTime()) / 3600000 : 999

    if (silentHours > 24) score -= 10
    score = Math.max(0, score)

    // Determine status
    let status: 'red' | 'amber' | 'green' = 'green'
    if (stats.turnaround_breach > 0 || stats.move_in_overdue > 0 || silentHours > 24 || stats.maintenance_overdue > 0) {
      status = 'red'
    } else if (stats.turnaround_warning > 0 || stats.maintenance_silent > 0 || silentHours > 12) {
      status = 'amber'
    }

    // Upsert
    await supabaseAdmin
      .from('cluster_health_cache')
      .update({
        health_status: status,
        health_score: score,
        ...stats,
        last_cluster_message_at: lastMsgTime?.toISOString() ?? null,
        cluster_silent_hours: Math.round(silentHours * 10) / 10,
        last_computed_at: new Date().toISOString(),
      })
      .eq('cluster', cluster)

  } catch (error) {
    console.error(`[health:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
  }
}

export async function computeAllClusters(): Promise<void> {
  const clusters = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']
  await Promise.all(clusters.map(c => computeClusterHealth(c)))
}

export async function getAllClusterHealth(): Promise<ClusterHealth[]> {
  const { data } = await supabaseAdmin
    .from('cluster_health_cache')
    .select('*')
    .order('cluster', { ascending: true })
  return (data ?? []) as ClusterHealth[]
}

export async function getClusterTicketDetails(cluster: string) {
  const { data: tickets } = await supabaseAdmin
    .from('ai_report_tickets')
    .select('*')
    .eq('cluster', cluster)
    .eq('status', 'open')
    .order('sla_overdue', { ascending: false })
    .order('age_days', { ascending: false })

  const since = new Date(Date.now() - 48 * 3600000).toISOString()
  const { data: messages } = await supabaseAdmin
    .from('lark_group_messages')
    .select('content, message_time')
    .eq('cluster', cluster)
    .gte('created_at', since)

  return (tickets ?? []).map(t => ({
    ...t,
    category: categorizeTicket(t.issue_description ?? ''),
    activity_status: getTicketActivityStatus(t, messages ?? []),
  }))
}

export async function generateAskMessage(ticket: {
  ticket_id: string; unit_number: string | null; issue_description: string
  owner_name: string | null; owner_role: string | null; age_days: number
  sla_overdue: boolean; summary: string | null
}, cluster: string): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 150,
      system: `Generate message from Lee Seng Hee (CEO BeLive Property Hub) to cluster ${cluster} group. Manglish, direct, caring. Tag owner by role. Mention unit + issue. Ask for status. Under 60 words. End with 🙏`,
      messages: [{ role: 'user', content: `Ticket: ${ticket.ticket_id}\nUnit: ${ticket.unit_number}\nIssue: ${ticket.issue_description}\nOwner: [${ticket.owner_role}] ${ticket.owner_name}\nAge: ${ticket.age_days}d\nSLA: ${ticket.sla_overdue ? 'OVERDUE' : 'active'}` }],
    })
    let text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  } catch {
    return `Team — update on ${ticket.ticket_id}? Unit ${ticket.unit_number}, ${ticket.issue_description}. Please update. 🙏`
  }
}
