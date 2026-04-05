import { supabaseAdmin } from './supabase-admin'
import { getTenantToken } from './lark-tokens'
import { createIncident, analyseIncident, classifyMessage, extractKeywords } from './incidents'
import { getActiveGroups, updateLastScanned, incrementGroupStats } from './monitored-groups'
import type { MonitoredGroup, Incident } from './types'

const LARK_API = 'https://open.larksuite.com'
const nameCache = new Map<string, string>()

type LarkMessage = {
  message_id: string
  sender_name: string | null
  sender_open_id: string | null
  content: string
  message_time: string
}

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
  } catch {
    nameCache.set(openId, openId)
    return openId
  }
}

export async function readGroupMessages(group: MonitoredGroup, hoursBack = 6): Promise<LarkMessage[]> {
  try {
    const token = await getTenantToken()
    const res = await fetch(
      `${LARK_API}/open-apis/im/v1/messages?container_id_type=chat&container_id=${group.chat_id}&page_size=50&sort_type=ByCreateTimeDesc`,
      { headers: { Authorization: `Bearer ${token}` } }
    )
    const data = await res.json()
    if (data.code !== 0) { console.error(`[scanner:read:${group.cluster}]`, data.msg); return [] }

    const items = data.data?.items ?? []
    const cutoff = Date.now() - hoursBack * 3600000
    const newMessages: LarkMessage[] = []

    for (const item of items) {
      const messageId = item.message_id as string
      if (!messageId) continue
      const msgType = item.msg_type as string
      if (['system', 'image', 'media', 'file'].includes(msgType)) continue
      const createTime = parseInt(item.create_time)
      if (createTime < cutoff) continue

      const { data: existing } = await supabaseAdmin.from('lark_group_messages').select('id').eq('message_id', messageId).single()
      if (existing) continue

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

      const senderOpenId = item.sender?.id ?? null
      const senderName = senderOpenId ? await getSenderName(senderOpenId) : null

      await supabaseAdmin.from('lark_group_messages').insert({
        cluster: group.cluster, chat_id: group.chat_id, message_id: messageId,
        sender_name: senderName, sender_open_id: senderOpenId,
        content, message_time: new Date(createTime).toISOString(),
      })

      newMessages.push({ message_id: messageId, sender_name: senderName, sender_open_id: senderOpenId, content, message_time: new Date(createTime).toISOString() })
    }

    return newMessages
  } catch (error) {
    console.error(`[scanner:read:${group.cluster}]`, error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

function messageMatchesIncident(content: string, incident: Incident): boolean {
  const keywords = incident.thread_keywords ?? []
  if (keywords.length === 0) return false
  const lower = content.toLowerCase()
  let matches = 0
  for (const kw of keywords) if (lower.includes(kw)) matches++
  return matches >= 2 || (matches === 1 && Date.now() - new Date(incident.created_at).getTime() < 6 * 3600000)
}

export async function processGroupMessages(group: MonitoredGroup, messages: LarkMessage[]): Promise<{ new_incidents: number; linked: number }> {
  let newCount = 0
  let linkedCount = 0

  const { data: openIncidents } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('cluster', group.cluster)
    .not('status', 'in', '("resolved","archived")')

  // Ensure keywords populated
  for (const inc of openIncidents ?? []) {
    if (!inc.thread_keywords || inc.thread_keywords.length === 0) {
      const kw = extractKeywords(inc.title, inc.raw_content)
      await supabaseAdmin.from('incidents').update({ thread_keywords: kw }).eq('id', inc.id)
      inc.thread_keywords = kw
    }
  }

  for (const msg of messages) {
    if (msg.content.trim().length < 15) continue

    // Try to link to existing incident
    let linked = false
    for (const inc of openIncidents ?? []) {
      if (messageMatchesIncident(msg.content, inc as Incident)) {
        await supabaseAdmin.from('incident_timeline').insert({
          incident_id: inc.id, entry_type: 'message',
          sender_name: msg.sender_name, sender_open_id: msg.sender_open_id,
          content: msg.content, lark_message_id: msg.message_id,
          is_lee: msg.sender_open_id === process.env.LEE_LARK_CHAT_ID,
        })
        await supabaseAdmin.from('incidents').update({
          last_thread_message_at: msg.message_time,
          thread_message_count: (inc.thread_message_count ?? 0) + 1,
          silence_hours: 0,
        }).eq('id', inc.id)
        linked = true; linkedCount++; break
      }
    }

    if (!linked) {
      // Classify as new incident
      const classification = await classifyMessage(msg.content, 'lark_scan', group.context ?? undefined)
      if (classification.is_incident) {
        const incident = await createIncident({
          source: 'lark_scan', source_message_id: msg.message_id,
          chat_id: group.chat_id, cluster: group.cluster,
          group_name: group.group_name, monitored_group_id: group.id,
          agent: classification.agent, problem_type: classification.problem_type,
          priority: classification.priority, severity: classification.severity,
          title: classification.title, raw_content: msg.content,
          sender_name: msg.sender_name ?? undefined, sender_open_id: msg.sender_open_id ?? undefined,
        })
        if (incident) {
          await analyseIncident(incident.id)
          newCount++
        }
      }
    }

    await supabaseAdmin.from('lark_group_messages')
      .update({ processed: true })
      .eq('message_id', msg.message_id)
  }

  return { new_incidents: newCount, linked: linkedCount }
}

export async function scanGroup(group: MonitoredGroup) {
  const startTime = Date.now()
  try {
    const messages = await readGroupMessages(group, 48)
    const result = await processGroupMessages(group, messages)
    await updateLastScanned(group.chat_id)
    await incrementGroupStats(group.chat_id, messages.length, result.new_incidents)

    await supabaseAdmin.from('scan_logs').insert({
      trigger_type: 'scheduled', trigger_source: 'scanGroup',
      cluster: group.cluster, chat_id: group.chat_id, group_name: group.group_name,
      messages_found: messages.length, new_messages: messages.length,
      issues_detected: result.new_incidents, status: 'success',
      duration_ms: Date.now() - startTime,
    })

    return { cluster: group.cluster, messages: messages.length, ...result }
  } catch (error) {
    await supabaseAdmin.from('scan_logs').insert({
      trigger_type: 'scheduled', trigger_source: 'scanGroup',
      cluster: group.cluster, chat_id: group.chat_id, group_name: group.group_name,
      status: 'failed', error_message: error instanceof Error ? error.message : 'Unknown',
      duration_ms: Date.now() - startTime,
    })
    return { cluster: group.cluster, messages: 0, new_incidents: 0, linked: 0 }
  }
}

export async function scanEnabledGroups() {
  const groups = await getActiveGroups()
  const results = []
  for (const group of groups) {
    results.push(await scanGroup(group))
  }
  return {
    scannedAt: new Date().toISOString(),
    groups_scanned: results.length,
    total_messages: results.reduce((s, r) => s + r.messages, 0),
    total_incidents: results.reduce((s, r) => s + r.new_incidents, 0),
    results,
  }
}
