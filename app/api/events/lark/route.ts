import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createIncident, analyseIncident, classifyMessage, extractKeywords } from '@/lib/incidents'
import type { ClassifyResult } from '@/lib/incidents'
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

    // Parse content based on message type — handles text, post (rich), and interactive cards
    let content = ''
    try {
      const body = JSON.parse(rawContent)
      if (body.text) {
        // Plain text message
        content = body.text.replace(/<[^>]*>/g, '').trim()
      } else if (body.title || body.content) {
        // Rich text post (Lark "post" msg_type) — content is array of arrays of elements
        const texts: string[] = []
        if (body.title) texts.push(body.title)
        const lines = body.content ?? []
        for (const line of lines) {
          if (Array.isArray(line)) {
            for (const elem of line) {
              if (elem?.text) texts.push(elem.text)
              else if (elem?.tag === 'a' && elem?.text) texts.push(elem.text)
              else if (elem?.tag === 'at' && elem?.user_name) texts.push(`@${elem.user_name}`)
            }
          }
        }
        content = texts.join(' ').replace(/\s+/g, ' ').trim()
      } else if (body.elements) {
        // Interactive card
        const texts: string[] = []
        for (const row of body.elements ?? []) {
          if (Array.isArray(row)) {
            for (const elem of row) if (elem?.text) texts.push(elem.text)
          } else if ((row as { text?: string })?.text) {
            texts.push((row as { text: string }).text)
          }
        }
        content = texts.join('\n').trim()
      }
    } catch {
      content = rawContent
    }
    if (!content?.trim()) return

    // Resolve @_user_N mentions to real names from payload
    const mentions = message.mentions as Array<{ key: string; id: Record<string, string>; name: string }> | undefined
    if (mentions?.length) {
      for (const m of mentions) {
        if (m.key && m.name) content = content.replaceAll(m.key, `@${m.name}`)
      }
    }

    // Extract sender info
    const senderId = sender?.sender_id as Record<string, unknown> | undefined
    const senderOpenId = senderId?.open_id as string ?? ''

    // Filter bot self-messages
    if (senderOpenId === BOT_OPEN_ID) return

    const messageTime = message.create_time
      ? new Date(parseInt(message.create_time as string)).toISOString()
      : new Date().toISOString()

    // Lark thread linkage — present when message is a reply in thread
    const parentId = (message.parent_id as string) ?? null
    const rootId = (message.root_id as string) ?? null

    if (chatType === 'group') {
      // Resolve sender name from staff directory.
      // On failure we store NULL on the incident rather than the raw
      // open_id — raw open_ids (cli_xxx / ou_xxx) used to leak into
      // every UI surface that reads sender_name. Display layers now
      // fall back to "— unknown" via sanitizeOwnerLabel.
      const { resolveOpenId } = await import('@/lib/staff-directory')
      const staff = await resolveOpenId(senderOpenId)
      const resolvedName = staff?.name ?? null

      await processGroupMessage({
        message_id: messageId,
        chat_id: chatId,
        content,
        sender_open_id: senderOpenId,
        sender_name: resolvedName,
        message_time: messageTime,
        parent_id: parentId,
        root_id: rootId,
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
  sender_open_id: string; sender_name: string | null; message_time: string
  parent_id?: string | null; root_id?: string | null
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

    // Log to watchdog — sender_name is nullable now, so feed the logger
    // an explicit placeholder rather than letting null leak through.
    const { logger } = await import('@/lib/activity-logger')
    logger.messageReceived({
      messageId: payload.message_id,
      senderName: payload.sender_name ?? '— unknown',
      cluster: group.cluster,
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
    //    Primary: Lark thread root_id (strict — same conversation thread)
    //    Fallback: strict keyword + unit number match (only for non-thread messages)
    const matched = await matchMessageToIncident(
      payload.content,
      group.cluster,
      payload.chat_id,
      payload.root_id ?? null,
      payload.parent_id ?? null,
    )

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
        await resolveIncident(matched.id, payload.sender_name ?? '— unknown', payload.content.slice(0, 100))
      }

      await supabaseAdmin.from('lark_group_messages').update({ processed: true, issue_detected: true }).eq('message_id', payload.message_id)
      console.log(`[lark:group:${group.cluster}]`, `Linked to incident ${matched.id}`)
      return
    }

    // 7. Classify as potential new incident.
    //    Classification now runs EXACTLY ONCE per message (Spec Critical
    //    Constraint #4): classifyMessage does matcher + 5-step LLM; the
    //    result flows through createIncident (for the merge path) and
    //    analyseIncident (so it does not re-classify).
    const classification: ClassifyResult = await classifyMessage(
      payload.content,
      'lark_group',
      group.context ?? undefined,
      {
        cluster: group.cluster,
        lark_root_id: payload.root_id ?? null,
        sender_open_id: payload.sender_open_id,
      }
    )

    if (!classification.is_incident) {
      await supabaseAdmin.from('lark_group_messages').update({ processed: true }).eq('message_id', payload.message_id)
      return
    }

    // 8. Create new incident (or merge into target when matcher said so).
    //    War-room fields: is_classified=true when the LLM returned all 6
    //    reasoning steps (i.e. a full successful classification), false
    //    when we fell back. raw_lark_text preserves the tenant voice so
    //    the /clusters amber fallback always has source text.
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
      category: classification.category,
      assigned_to: classification.assigned_to,
      lark_root_id: payload.root_id ?? null,
      situation_summary: classification.situation_summary,
      is_classified: classification.reasoning_steps.length === 6,
      raw_lark_text: payload.content,
    }, classification.match_result)

    if (incident) {
      // Only run the analyse pipeline on truly new incidents.
      // When the matcher merged into an existing target, createIncident
      // returned the target row — its original reasoning trace stands
      // and we don't want to re-classify or rebuild the proposal.
      const wasMerged = classification.match_result.decision === 'merge' &&
        classification.match_result.target_id === incident.id

      if (!wasMerged) {
        await analyseIncident(incident.id, classification)
      }

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
    const classification: ClassifyResult = await classifyMessage(
      payload.content,
      'lark_webhook',
      undefined,
      {
        cluster: null,
        lark_root_id: null,
        sender_open_id: payload.sender_open_id,
      }
    )
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
      category: classification.category,
      assigned_to: classification.assigned_to,
      lark_root_id: null,
      situation_summary: classification.situation_summary,
      is_classified: classification.reasoning_steps.length === 6,
      raw_lark_text: payload.content,
    }, classification.match_result)

    if (incident) {
      const wasMerged = classification.match_result.decision === 'merge' &&
        classification.match_result.target_id === incident.id
      if (!wasMerged) await analyseIncident(incident.id, classification)
    }
  } catch (error) {
    console.error('[lark:dm]', error instanceof Error ? error.message : 'Unknown')
  }
}

// Strict unit number regex: requires letter prefix or 2-segment hyphenated form like B-15-06, A1-21-09, D-47-11
// Excludes plain numbers like "1", "4", "50", or single segments like "19-12" without context
const STRICT_UNIT_REGEX = /\b[A-Z]\d?-\d{1,3}-\d{1,3}[A-Z]?\b/gi

// Stop words / generic terms that must NOT count as matching keywords
const KEYWORD_STOPLIST = new Set([
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '0',
  '10', '11', '12', '13', '14', '15', '20', '25', '30', '40', '50', '60', '70', '80', '90', '100',
  'room', 'unit', 'floor', 'block', 'house', 'level',
])

function extractStrictUnitTokens(text: string): Set<string> {
  const matches = text.match(STRICT_UNIT_REGEX) ?? []
  return new Set(matches.map(m => m.toLowerCase()))
}

async function matchMessageToIncident(
  content: string,
  cluster: string | null,
  chatId: string,
  rootId: string | null,
  parentId: string | null,
) {
  try {
    // PRIMARY MATCH: Lark thread root_id — same conversation thread, scoped to same chat
    // This is the only reliable way to know two messages belong together
    if (rootId || parentId) {
      const threadAnchor = rootId ?? parentId!
      // Look up incident whose source_message_id == threadAnchor (incident was created from the root)
      const { data: byRoot } = await supabaseAdmin
        .from('incidents')
        .select('*')
        .eq('chat_id', chatId)
        .eq('source_message_id', threadAnchor)
        .in('status', ['new', 'analysed', 'awaiting_lee', 'acting'])
        .maybeSingle()
      if (byRoot) return byRoot

      // OR look up timeline entries that already linked to this thread
      const { data: linkedTimeline } = await supabaseAdmin
        .from('incident_timeline')
        .select('incident_id')
        .eq('lark_message_id', threadAnchor)
        .limit(1)
        .maybeSingle()
      if (linkedTimeline?.incident_id) {
        const { data: inc } = await supabaseAdmin
          .from('incidents')
          .select('*')
          .eq('id', linkedTimeline.incident_id)
          .in('status', ['new', 'analysed', 'awaiting_lee', 'acting'])
          .maybeSingle()
        if (inc) return inc
      }
      // Thread reply but no matching incident — do NOT fall through to keyword matching
      // (it's a thread reply to something else, not a new keyword-correlated message)
      return null
    }

    // FALLBACK MATCH: only for top-level (non-thread) messages
    // Strict criteria: must match (a) ticket_id explicitly, OR (b) strict unit number from title
    // Generic keywords / single digits / property names are NOT enough
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .in('status', ['new', 'analysed', 'awaiting_lee', 'acting'])
      .eq('cluster', cluster ?? '')
      .eq('chat_id', chatId)  // also require same chat
      .order('created_at', { ascending: false })
      .limit(20)

    if (!incidents || incidents.length === 0) return null

    const messageUnits = extractStrictUnitTokens(content)
    const lower = content.toLowerCase()

    for (const inc of incidents) {
      // (a) Ticket ID match — strongest signal
      if (inc.ticket_id && content.includes(inc.ticket_id)) return inc

      // (b) Strict unit number match — requires the SAME structured unit (e.g., B-15-06)
      // appearing in both the incident title/content AND the new message
      const incidentUnits = new Set([
        ...extractStrictUnitTokens(inc.title ?? ''),
        ...extractStrictUnitTokens(inc.raw_content ?? ''),
      ])
      if (incidentUnits.size > 0 && messageUnits.size > 0) {
        for (const u of messageUnits) {
          if (incidentUnits.has(u)) return inc
        }
      }

      // (c) High-confidence keyword match: requires 3+ NON-STOPLIST keywords matching
      // (much stricter than the previous "2 matches wins")
      const keywords = (inc.thread_keywords as string[] | null) ?? []
      const meaningful = keywords.filter(k => k && k.length >= 4 && !KEYWORD_STOPLIST.has(k.toLowerCase()))
      if (meaningful.length >= 3) {
        const matchCount = meaningful.filter(k => lower.includes(k.toLowerCase())).length
        if (matchCount >= 3) return inc
      }
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
