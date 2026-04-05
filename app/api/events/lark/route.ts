import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createIncident, analyseIncident, classifyMessage, extractKeywords } from '@/lib/incidents'
import { getGroupByChatId } from '@/lib/monitored-groups'
import { sendLarkMessage } from '@/lib/lark'

const BOT_OPEN_ID = process.env.LARK_BOT_OPEN_ID ?? 'ou_656cbe961cf2dd432df47bd6636406dd'
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''

const NOISE_PATTERNS = ['ok', 'noted', 'thanks', 'thank you', 'terima kasih',
  'tq', 'roger', 'done', 'ok noted', 'will do', 'on it', 'received']

async function processLarkWebhook(body: Record<string, unknown>) {
  try {
    const event = body.event as Record<string, unknown> | undefined
    if (!event) return

    const message = event.message as Record<string, unknown> | undefined
    const sender = event.sender as Record<string, unknown> | undefined
    if (!message) return

    const messageId = message.message_id as string
    const chatId = message.chat_id as string
    const chatType = message.chat_type as string // 'p2p' or 'group'
    const rawContent = message.content as string

    // Parse content
    let content: string
    try { content = JSON.parse(rawContent).text ?? rawContent } catch { content = rawContent }
    if (!content?.trim()) return

    // Extract sender info
    const senderId = sender?.sender_id as Record<string, unknown> | undefined
    const senderOpenId = senderId?.open_id as string ?? ''

    // Filter bot self-messages
    if (senderOpenId === BOT_OPEN_ID) return

    const messageTime = message.create_time
      ? new Date(parseInt(message.create_time as string)).toISOString()
      : new Date().toISOString()

    if (chatType === 'group') {
      await processGroupMessage({
        message_id: messageId,
        chat_id: chatId,
        content,
        sender_open_id: senderOpenId,
        sender_name: senderOpenId, // Will be resolved if needed
        message_time: messageTime,
      })
    } else {
      // p2p — direct bot message (existing flow)
      await processDirectMessage({
        message_id: messageId,
        chat_id: chatId,
        content,
        sender_open_id: senderOpenId,
      })
    }
  } catch (error) {
    console.error('[lark:webhook]', error instanceof Error ? error.message : 'Unknown')
  }
}

async function processGroupMessage(payload: {
  message_id: string; chat_id: string; content: string
  sender_open_id: string; sender_name: string; message_time: string
}) {
  try {
    // 1. Check if monitored group
    const group = await getGroupByChatId(payload.chat_id)
    if (!group || !group.scanning_enabled) return

    // 2. Dedup check
    const { data: existing } = await supabaseAdmin
      .from('lark_group_messages')
      .select('id')
      .eq('message_id', payload.message_id)
      .single()
    if (existing) return

    // 3. Save to lark_group_messages
    await supabaseAdmin.from('lark_group_messages').insert({
      cluster: group.cluster,
      chat_id: payload.chat_id,
      message_id: payload.message_id,
      sender_name: payload.sender_name,
      sender_open_id: payload.sender_open_id,
      content: payload.content,
      message_time: payload.message_time,
      processed: false,
    })

    console.log(`[lark:group:${group.cluster}]`, `Saved msg from ${payload.sender_open_id}: ${payload.content.slice(0, 60)}`)

    // Log to watchdog
    const { logger } = await import('@/lib/activity-logger')
    logger.messageReceived({
      messageId: payload.message_id, senderName: payload.sender_name, cluster: group.cluster,
      groupName: group.group_name, chatId: payload.chat_id,
      contentPreview: payload.content, contentLength: payload.content.length, noisePassed: true,
    }).catch(() => {})

    // 3.5. Standup report detection (for cluster groups)
    if (group.group_type === 'cluster') {
      const { processIncomingClusterMessage } = await import('@/lib/briefings/standup-detector')
      processIncomingClusterMessage(payload.content, payload.sender_name, payload.sender_open_id, group.cluster, payload.chat_id).catch(console.error)
    }

    // 4. AI Report group — parse as report
    if (group.group_type === 'ai_report') {
      if (payload.content.includes('BLV-RQ-') || payload.content.includes('Livability Report')) {
        const { parseAIReportMessage, upsertTickets } = await import('@/lib/ai-report-parser')
        const tickets = parseAIReportMessage(payload.content, payload.message_id)
        if (tickets.length > 0) {
          await upsertTickets(tickets, new Date())
          console.log(`[lark:aiReport]`, `Parsed ${tickets.length} tickets`)
        }
      }
      await supabaseAdmin.from('lark_group_messages').update({ processed: true }).eq('message_id', payload.message_id)
      return
    }

    // 5. Skip noise
    if (payload.content.length < 15) {
      await supabaseAdmin.from('lark_group_messages').update({ processed: true }).eq('message_id', payload.message_id)
      return
    }
    if (NOISE_PATTERNS.some(p => payload.content.toLowerCase().trim() === p)) {
      await supabaseAdmin.from('lark_group_messages').update({ processed: true }).eq('message_id', payload.message_id)
      return
    }

    // 6. Try to match to existing open incident
    const matched = await matchMessageToIncident(payload.content, group.cluster)

    if (matched) {
      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: matched.id,
        entry_type: 'message',
        sender_name: payload.sender_name,
        sender_open_id: payload.sender_open_id,
        content: payload.content,
        lark_message_id: payload.message_id,
        is_lee: payload.sender_open_id === LEE_OPEN_ID,
      })
      await supabaseAdmin.from('incidents').update({
        last_thread_message_at: payload.message_time,
        thread_message_count: (matched.thread_message_count ?? 0) + 1,
        silence_hours: 0,
        has_lee_replied: payload.sender_open_id === LEE_OPEN_ID ? true : matched.has_lee_replied,
      }).eq('id', matched.id)

      // Check resolution keywords
      const resolutionWords = ['dah settle', 'resolved', 'selesai', 'dah fix', 'done', 'ok dah', 'siap', 'completed', 'fixed']
      if (resolutionWords.some(w => payload.content.toLowerCase().includes(w))) {
        const { resolveIncident } = await import('@/lib/incidents')
        await resolveIncident(matched.id, payload.sender_name, payload.content.slice(0, 100))
      }

      await supabaseAdmin.from('lark_group_messages').update({ processed: true, issue_detected: true }).eq('message_id', payload.message_id)
      console.log(`[lark:group:${group.cluster}]`, `Linked to incident ${matched.id}`)
      return
    }

    // 7. Classify as potential new incident
    const classification = await classifyMessage(payload.content, 'lark_group', group.context ?? undefined)

    if (!classification.is_incident) {
      await supabaseAdmin.from('lark_group_messages').update({ processed: true }).eq('message_id', payload.message_id)
      return
    }

    // 8. Create new incident
    const incident = await createIncident({
      source: 'lark_scan',
      source_message_id: payload.message_id,
      chat_id: payload.chat_id,
      cluster: group.cluster,
      group_name: group.group_name,
      monitored_group_id: group.id,
      agent: classification.agent,
      problem_type: classification.problem_type,
      priority: classification.priority,
      severity: classification.severity,
      title: classification.title,
      raw_content: payload.content,
      sender_name: payload.sender_name,
      sender_open_id: payload.sender_open_id,
    })

    if (incident) {
      await analyseIncident(incident.id)

      // P1 — DM Lee immediately
      if (classification.priority === 'P1' && LEE_OPEN_ID) {
        sendLarkMessage(LEE_OPEN_ID,
          `🚨 P1 in ${group.group_name}\n${classification.title}\n\nView: https://belive-nucleus.vercel.app/command`,
          'open_id'
        ).catch(console.error)
      }
    }

    await supabaseAdmin.from('lark_group_messages').update({ processed: true, issue_detected: true }).eq('message_id', payload.message_id)
    console.log(`[lark:group:${group.cluster}]`, `New incident: ${classification.title}`)
  } catch (error) {
    console.error('[lark:groupMsg]', error instanceof Error ? error.message : 'Unknown')
  }
}

async function processDirectMessage(payload: {
  message_id: string; chat_id: string; content: string; sender_open_id: string
}) {
  try {
    const classification = await classifyMessage(payload.content, 'lark_webhook')
    if (!classification.is_incident) return

    const incident = await createIncident({
      source: 'lark_webhook',
      source_message_id: payload.message_id,
      chat_id: payload.chat_id,
      agent: classification.agent,
      problem_type: classification.problem_type,
      priority: classification.priority,
      severity: classification.severity,
      title: classification.title,
      raw_content: payload.content,
      sender_open_id: payload.sender_open_id,
    })

    if (incident) await analyseIncident(incident.id)
  } catch (error) {
    console.error('[lark:dm]', error instanceof Error ? error.message : 'Unknown')
  }
}

async function matchMessageToIncident(content: string, cluster: string | null) {
  try {
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .in('status', ['new', 'analysed', 'awaiting_lee', 'acting'])
      .eq('cluster', cluster ?? '')
      .order('created_at', { ascending: false })
      .limit(20)

    if (!incidents || incidents.length === 0) return null

    const lower = content.toLowerCase()

    for (const inc of incidents) {
      // Match by thread_keywords
      const keywords = inc.thread_keywords as string[] | null
      if (keywords && keywords.length > 0) {
        const matchCount = keywords.filter((kw: string) => lower.includes(kw.toLowerCase())).length
        if (matchCount >= 2) return inc
        if (matchCount >= 1 && keywords.length <= 3) return inc
      }

      // Match by ticket_id
      if (inc.ticket_id && content.includes(inc.ticket_id)) return inc

      // Match by unit number from title
      const unitMatch = inc.title.match(/[A-Z]-?\d{1,3}-?\d{1,3}/i)
      if (unitMatch && lower.includes(unitMatch[0].toLowerCase())) return inc
    }

    return null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Challenge verification
    if (body.challenge) return NextResponse.json({ challenge: body.challenge })
    if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge ?? body.token })

    // Return 200 immediately, process async
    after(async () => { await processLarkWebhook(body) })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
