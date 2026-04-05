import { supabaseAdmin } from './supabase-admin'
import { getTenantToken } from './lark-tokens'
import { createIncident, analyseIncident, classifyMessage } from './incidents'
import { parseAIReportMessage, upsertTickets, getOpenTickets } from './ai-report-parser'
import { sendLarkMessage } from './lark'
import Anthropic from '@anthropic-ai/sdk'

const LARK_API = 'https://open.larksuite.com'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const AI_REPORT_CHAT_ID = 'oc_a4addada959faf09e220364d4fabae75'

const nameCache = new Map<string, string>()

type RawMessage = { message_id: string; sender_name: string | null; sender_open_id: string | null; content: string; message_time: string }

async function getSenderName(openId: string): Promise<string> {
  if (!openId) return 'Unknown'
  if (nameCache.has(openId)) return nameCache.get(openId)!
  try {
    const token = await getTenantToken()
    const res = await fetch(`${LARK_API}/open-apis/contact/v3/users/${openId}?user_id_type=open_id`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    const name = data.data?.user?.name ?? openId
    nameCache.set(openId, name)
    return name
  } catch { nameCache.set(openId, openId); return openId }
}

async function readGroupRawMessages(chatId: string, hoursBack = 48): Promise<RawMessage[]> {
  try {
    const token = await getTenantToken()
    const res = await fetch(`${LARK_API}/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=50&sort_type=ByCreateTimeDesc`, { headers: { Authorization: `Bearer ${token}` } })
    const data = await res.json()
    if (data.code !== 0) return []

    const cutoff = Date.now() - hoursBack * 3600000
    const messages: RawMessage[] = []

    for (const item of data.data?.items ?? []) {
      const msgType = item.msg_type as string
      if (['system', 'image', 'media', 'file'].includes(msgType)) continue
      const createTime = parseInt(item.create_time)
      if (createTime < cutoff) continue

      let content = ''
      try {
        const body = JSON.parse(item.body?.content ?? '{}')
        if (body.text) content = body.text.replace(/<[^>]*>/g, '').trim()
        else if (body.content) {
          const texts: string[] = []
          for (const line of body.content ?? []) for (const elem of line ?? []) if (elem.text) texts.push(elem.text)
          content = texts.join(' ').trim()
        }
      } catch { content = item.body?.content ?? '' }

      if (!content.trim()) continue

      const openId = item.sender?.id ?? null
      const name = openId ? await getSenderName(openId) : null

      messages.push({ message_id: item.message_id, sender_name: name, sender_open_id: openId, content, message_time: new Date(createTime).toISOString() })
    }
    return messages
  } catch (error) {
    console.error('[crossGroup:read]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

async function generateProbeMessage(ticket: { ticket_id: string; issue_description: string; unit_number: string | null; age_days: number; owner_role: string | null; owner_name: string | null; sla_overdue: boolean; summary: string; cluster: string | null }): Promise<string> {
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: `Generate a message from Lee Seng Hee (CEO, BeLive Property Hub) checking on an unresolved ticket with no team discussion. Direct, caring, Manglish. Under 80 words. End with 🙏`,
      messages: [{ role: 'user', content: `Ticket: ${ticket.ticket_id}\nIssue: ${ticket.issue_description}\nUnit: ${ticket.unit_number}\nAge: ${ticket.age_days} days\nOwner: [${ticket.owner_role}] ${ticket.owner_name}\nSLA: ${ticket.sla_overdue ? 'OVERDUE' : 'active'}` }],
    })
    let text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    return text
  } catch { return `Team — any update on ${ticket.ticket_id}? Unit ${ticket.unit_number}, ${ticket.issue_description}. Please update. 🙏` }
}

export async function runCrossGroupIntelligence() {
  const result = {
    phase1: { reports_parsed: 0, tickets_found: 0, tickets_upserted: 0 },
    phase2: { active_tickets: 0, silent_tickets: 0, incidents_created: 0 },
    phase3: { clusters_scanned: 0, new_incidents: 0, linked_messages: 0 },
    total_incidents_created: 0,
  }

  try {
    // PHASE 1 — Parse AI Report
    console.log('[crossGroup] Phase 1: AI Report')
    const reportMessages = await readGroupRawMessages(AI_REPORT_CHAT_ID, 24)

    for (const msg of reportMessages) {
      if (msg.content.includes('Master Livability Report') || msg.content.includes('BLV-RQ-')) {
        const tickets = parseAIReportMessage(msg.content, msg.message_id)
        result.phase1.tickets_found += tickets.length
        if (tickets.length > 0) {
          const upserted = await upsertTickets(tickets, new Date())
          result.phase1.tickets_upserted += upserted
          result.phase1.reports_parsed++
        }
      }
    }

    // PHASE 2 — Check cluster activity for open tickets
    console.log('[crossGroup] Phase 2: Ticket-cluster correlation')
    const openTickets = await getOpenTickets()

    for (const ticket of openTickets) {
      if (!ticket.cluster) continue

      // Check if incident already exists for this ticket
      const { data: existing } = await supabaseAdmin
        .from('incidents')
        .select('id')
        .eq('ticket_id', ticket.ticket_id)
        .single()

      if (existing) { result.phase2.active_tickets++; continue }

      // Check cluster group for activity
      const { data: clusterGroup } = await supabaseAdmin
        .from('monitored_groups')
        .select('chat_id')
        .eq('cluster', ticket.cluster)
        .eq('group_type', 'cluster')
        .single()

      if (!clusterGroup) continue

      // Search cluster messages for ticket references
      const { data: clusterMsgs } = await supabaseAdmin
        .from('lark_group_messages')
        .select('content, sender_name, message_time')
        .eq('cluster', ticket.cluster)
        .order('created_at', { ascending: false })
        .limit(20)

      const matchedMsgs = (clusterMsgs ?? []).filter(m => {
        const lower = m.content.toLowerCase()
        return lower.includes(ticket.ticket_id.toLowerCase()) ||
          (ticket.unit_number && lower.includes(ticket.unit_number.toLowerCase())) ||
          lower.includes(ticket.issue_description.slice(0, 20).toLowerCase())
      })

      if (matchedMsgs.length > 0) {
        result.phase2.active_tickets++
        // Create incident with cluster context
        const inc = await createIncident({
          source: 'lark_scan', cluster: ticket.cluster,
          chat_id: clusterGroup.chat_id,
          agent: 'coo', problem_type: 'ops_maintenance',
          priority: ticket.sla_overdue ? 'P1' : ticket.age_days > 3 ? 'P2' : 'P3',
          severity: ticket.sla_overdue ? 'RED' : ticket.age_days > 3 ? 'YELLOW' : 'GREEN',
          title: `${ticket.issue_description} — ${ticket.unit_number ?? ticket.property}`,
          raw_content: ticket.summary ?? ticket.issue_description,
          sender_name: ticket.owner_name ?? undefined,
        })
        if (inc) {
          await supabaseAdmin.from('incidents').update({
            incident_type: 'reactive', ticket_id: ticket.ticket_id,
            ticket_age_days: ticket.age_days, sla_date: ticket.sla_date,
            sla_overdue: ticket.sla_overdue,
            ticket_owner_name: ticket.owner_name, ticket_owner_role: ticket.owner_role,
          }).eq('id', inc.id)
          await supabaseAdmin.from('ai_report_tickets').update({ incident_id: inc.id, cluster_activity_detected: true }).eq('id', ticket.id)
          await analyseIncident(inc.id)
          result.phase2.incidents_created++
          result.total_incidents_created++
        }
      } else if (ticket.age_days >= 1) {
        result.phase2.silent_tickets++
        // Silent ticket — generate probe
        const probe = await generateProbeMessage(ticket)
        const inc = await createIncident({
          source: 'lark_scan', cluster: ticket.cluster,
          chat_id: clusterGroup.chat_id,
          agent: 'coo', problem_type: 'ops_maintenance',
          priority: ticket.sla_overdue ? 'P1' : 'P2',
          severity: ticket.sla_overdue ? 'RED' : 'YELLOW',
          title: `[SILENT] ${ticket.issue_description} — ${ticket.unit_number ?? ticket.property}`,
          raw_content: ticket.summary ?? ticket.issue_description,
          sender_name: ticket.owner_name ?? undefined,
        })
        if (inc) {
          await supabaseAdmin.from('incidents').update({
            incident_type: 'silent_ticket', ticket_id: ticket.ticket_id,
            ticket_age_days: ticket.age_days, sla_date: ticket.sla_date,
            sla_overdue: ticket.sla_overdue,
            ticket_owner_name: ticket.owner_name, ticket_owner_role: ticket.owner_role,
            ai_proposal: probe, ai_reasoning: `Ticket ${ticket.ticket_id} is ${ticket.age_days} days old with no cluster group activity. Probe generated.`,
            ai_confidence: 90, status: 'awaiting_lee',
          }).eq('id', inc.id)
          await supabaseAdmin.from('ai_report_tickets').update({ incident_id: inc.id, cluster_activity_detected: false }).eq('id', ticket.id)
          result.phase2.incidents_created++
          result.total_incidents_created++
        }
      }
    }

    // PHASE 3 — Independent cluster scan (using existing scanner)
    console.log('[crossGroup] Phase 3: Cluster scan')
    const { scanEnabledGroups } = await import('./scanner')
    const clusterScan = await scanEnabledGroups()
    result.phase3.clusters_scanned = clusterScan.groups_scanned
    result.phase3.new_incidents = clusterScan.total_incidents
    result.total_incidents_created += clusterScan.total_incidents

    console.log('[crossGroup] Complete:', JSON.stringify(result))
    return result
  } catch (error) {
    console.error('[crossGroup]', error instanceof Error ? error.message : 'Unknown')
    return result
  }
}
