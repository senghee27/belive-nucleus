import { supabaseAdmin } from '@/lib/supabase-admin'
import { getTenantToken, getLeeUserToken } from '@/lib/lark-tokens'
import { sendP1AlertToLee } from '@/lib/briefings/issue-dm'
import { CLUSTER_COLORS } from '@/lib/issues'
import Anthropic from '@anthropic-ai/sdk'

const LARK_API = 'https://open.larksuite.com'
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export const TEST_CLUSTERS: Record<string, string> = {
  C1: 'oc_d1444b3f367192219a0a60b4dfb7fecb',
  C2: 'oc_2592d0368e35fce2a5712c95e446ec17',
  C11: 'oc_269af941aba2403693dd5dad8a45e832',
}

export const ALL_CLUSTERS: Record<string, string> = {
  C1: 'oc_d1444b3f367192219a0a60b4dfb7fecb',
  C2: 'oc_2592d0368e35fce2a5712c95e446ec17',
  C3: 'oc_8557892a71694977e646d0750286b532',
  C4: 'oc_23f4b9516f13fcdd9d049660bf3c2851',
  C5: 'oc_6d9d83b2c73ab20a168a3cc78de68994',
  C6: 'oc_c7c2b5e1a8728f527ca618f5b644c934',
  C7: 'oc_97eb2eebfc235bd180afceafe5a9c514',
  C8: 'oc_ace6312bfd7317550940ed001f04a92f',
  C9: 'oc_e59ce72f6864572d10d68462d856aad9',
  C10: 'oc_75e4c47ca8e8e1e57a0b39e90d80e105',
  C11: 'oc_269af941aba2403693dd5dad8a45e832',
}

type ParsedMessage = {
  message_id: string
  sender_name: string | null
  sender_open_id: string | null
  content: string
  message_time: string
}

type DetectedIssue = {
  title: string
  severity: string
  owner_name: string | null
  issue_type: string | null
  source_message_id: string
}

export async function readGroupMessages(
  cluster: string,
  chatId: string,
  hoursBack = 48
): Promise<ParsedMessage[]> {
  try {
    const token = await getTenantToken()

    // Fetch messages — no start_time filter to get recent messages
    const res = await fetch(
      `${LARK_API}/open-apis/im/v1/messages?container_id_type=chat&container_id=${chatId}&page_size=50&sort_type=ByCreateTimeDesc`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    )

    const data = await res.json()

    if (data.code !== 0) {
      console.error(`[lark:readGroup:${cluster}]`, `Error ${data.code}: ${data.msg}`)
      return []
    }

    const items = data.data?.items ?? []
    const newMessages: ParsedMessage[] = []

    // Only process messages from within hoursBack window
    const cutoff = Date.now() - hoursBack * 60 * 60 * 1000

    for (const item of items) {
      const messageId = item.message_id as string
      if (!messageId) continue

      // Skip system messages, images, media without text
      const msgType = item.msg_type as string
      if (msgType === 'system' || msgType === 'image' || msgType === 'media' || msgType === 'file') continue

      // Check time window
      const createTime = parseInt(item.create_time)
      if (createTime < cutoff) continue

      // Check if already exists
      const { data: existing } = await supabaseAdmin
        .from('lark_group_messages')
        .select('id')
        .eq('message_id', messageId)
        .single()

      if (existing) continue

      // Parse content — handle text, post (rich text), interactive
      let content = ''
      try {
        const body = JSON.parse(item.body?.content ?? '{}')
        if (body.text) {
          // Plain text — strip HTML tags
          content = body.text.replace(/<[^>]*>/g, '').trim()
        } else if (body.content) {
          // Rich text (post) — extract text from nested structure
          const texts: string[] = []
          for (const line of body.content ?? []) {
            for (const elem of line ?? []) {
              if (elem.text) texts.push(elem.text)
            }
          }
          content = texts.join(' ').trim()
        } else if (body.title) {
          content = body.title
        }
      } catch {
        content = item.body?.content ?? ''
      }

      if (!content.trim()) continue

      const senderOpenId = item.sender?.id ?? null

      const msg: ParsedMessage = {
        message_id: messageId,
        sender_name: senderOpenId,
        sender_open_id: senderOpenId,
        content,
        message_time: new Date(createTime).toISOString(),
      }

      // Insert into DB
      await supabaseAdmin.from('lark_group_messages').insert({
        cluster,
        chat_id: chatId,
        message_id: msg.message_id,
        sender_name: msg.sender_name,
        sender_open_id: msg.sender_open_id,
        content: msg.content,
        message_time: msg.message_time,
      })

      newMessages.push(msg)
    }

    console.log(`[lark:readGroup:${cluster}]`, `${newMessages.length} new messages`)
    return newMessages
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[lark:readGroup:${cluster}]`, message)
    return []
  }
}

export async function detectIssues(
  messages: ParsedMessage[],
  cluster: string
): Promise<DetectedIssue[]> {
  const issues: DetectedIssue[] = []

  for (const msg of messages) {
    try {
      const result = await client.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system: `You analyze BeLive Property Hub Lark messages for operational issues.
BeLive context: co-living operator, 3000+ rooms, 55+ condos, 11 clusters, Malaysia.
Classify if this message indicates: maintenance issue, tenant complaint, ops emergency, staff problem, or no issue.
Respond ONLY in valid JSON. No markdown, no backticks.
Format: {"is_issue":true,"severity":"RED","title":"short title","owner_name":"person name or null","issue_type":"maintenance|complaint|emergency|staff|null"}`,
        messages: [{ role: 'user', content: `Cluster: ${cluster}\nMessage: ${msg.content}` }],
      })

      const text = result.content[0].type === 'text' ? result.content[0].text : '{}'

      try {
        const parsed = JSON.parse(text)

        if (parsed.is_issue) {
          const severity = parsed.severity ?? 'YELLOW'
          const priority = severity === 'RED' ? 'P1' : severity === 'YELLOW' ? 'P2' : 'P3'
          const escalationHours = priority === 'P1' ? 2 : priority === 'P2' ? 24 : 48
          const chatIdForIssue = TEST_CLUSTERS[cluster as keyof typeof TEST_CLUSTERS] ?? msg.message_id

          const { data: newIssue } = await supabaseAdmin.from('lark_issues').insert({
            cluster,
            chat_id: chatIdForIssue,
            title: parsed.title,
            severity,
            priority,
            owner_name: parsed.owner_name,
            source_message_id: msg.message_id,
            last_activity: msg.message_time,
            escalation_due_at: new Date(Date.now() + escalationHours * 60 * 60 * 1000).toISOString(),
            cluster_color: CLUSTER_COLORS[cluster] ?? '#4B5A7A',
          }).select().single()

          // P1 immediate alert to Lee
          if (priority === 'P1' && newIssue) {
            sendP1AlertToLee({ ...newIssue, days_open: 0 }).catch(err =>
              console.error('[lark:p1Alert]', err instanceof Error ? err.message : err)
            )
          }

          issues.push({
            title: parsed.title,
            severity: parsed.severity,
            owner_name: parsed.owner_name,
            issue_type: parsed.issue_type,
            source_message_id: msg.message_id,
          })
        }

        // Mark message as processed
        await supabaseAdmin
          .from('lark_group_messages')
          .update({ processed: true, issue_detected: parsed.is_issue })
          .eq('message_id', msg.message_id)
      } catch {
        console.error(`[lark:detectIssues:${cluster}]`, 'Failed to parse AI response', text)
      }
    } catch (error) {
      console.error(`[lark:detectIssues:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
    }
  }

  console.log(`[lark:detectIssues:${cluster}]`, `${issues.length} issues detected`)
  return issues
}

export async function sendGroupMessage(
  chatId: string,
  content: string,
  asLee = true
): Promise<string | null> {
  // Try sending as Lee first, fall back to bot if it fails
  const tokens: string[] = []

  if (asLee) {
    try {
      tokens.push(await getLeeUserToken())
    } catch {
      console.warn('[lark:sendGroup]', 'User token unavailable, will use bot')
    }
  }

  // Always add tenant token as fallback
  try {
    tokens.push(await getTenantToken())
  } catch {
    console.error('[lark:sendGroup]', 'Tenant token also unavailable')
  }

  for (const token of tokens) {
    try {
      const res = await fetch(
        `${LARK_API}/open-apis/im/v1/messages?receive_id_type=chat_id`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            receive_id: chatId,
            msg_type: 'text',
            content: JSON.stringify({ text: content }),
          }),
        }
      )

      const data = await res.json()

      if (data.code === 0) {
        return data.data?.message_id ?? null
      }

      console.warn('[lark:sendGroup]', `Token failed (${data.code}: ${data.msg}), trying next...`)
    } catch (error) {
      console.warn('[lark:sendGroup]', error instanceof Error ? error.message : 'Unknown')
    }
  }

  console.error('[lark:sendGroup]', 'All tokens failed')
  return null
}

export async function scanTestClusters() {
  const { processNewMessages, checkSilenceGaps } = await import('@/lib/issue-thread')
  const results: Record<string, { newMessages: number; issues: number }> = {}

  for (const [cluster, chatId] of Object.entries(TEST_CLUSTERS)) {
    const messages = await readGroupMessages(cluster, chatId)
    // Link messages to existing issues first
    await processNewMessages(messages, cluster)
    // Detect new issues from unmatched messages
    const issues = await detectIssues(messages, cluster)
    // Check silence gaps
    await checkSilenceGaps(cluster)
    results[cluster] = { newMessages: messages.length, issues: issues.length }
  }

  return { scannedAt: new Date().toISOString(), clusters: results }
}
