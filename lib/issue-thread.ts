import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendLarkMessage } from '@/lib/lark'
import Anthropic from '@anthropic-ai/sdk'
import type { Issue } from '@/lib/issues'
import { formatDistanceToNow } from 'date-fns'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''
const SILENCE_ALERT_HOURS: Record<string, number> = { P1: 1, P2: 3, P3: 6 }

const RESOLUTION_KEYWORDS = [
  'dah settle', 'resolved', 'dah fix', 'done', 'selesai', 'ok dah',
  'siap dah', 'dah ok', 'completed', 'fixed', 'contractor dah dtg',
  'dah repair', 'issue closed', 'settled', 'dah siap',
]

type LarkGroupMessage = {
  message_id: string
  sender_name: string | null
  sender_open_id: string | null
  content: string
  message_time: string
}

export function extractKeywords(title: string, sourceContent?: string): string[] {
  const text = `${title} ${sourceContent ?? ''}`.toLowerCase()
  const words = text.split(/[\s,.\-—:;/()]+/).filter(w => w.length >= 2 && w.length <= 30)

  // Extract unit numbers (e.g., "12b", "d-303", "a-01-01")
  const unitMatches = text.match(/\b[a-z]?\d+[-]?\d*[a-z]?\b/gi) ?? []

  // Key ops words
  const opsWords = ['ac', 'rosak', 'bocor', 'lift', 'electric', 'water', 'pipe',
    'leak', 'flood', 'paip', 'lampu', 'lamp', 'rail', 'sink', 'aircon',
    'maintenance', 'repair', 'contractor', 'eviction', 'vertica', 'epic']

  const keywords = new Set<string>()

  for (const w of words) {
    if (opsWords.includes(w)) keywords.add(w)
  }
  for (const u of unitMatches) {
    keywords.add(u.toLowerCase())
  }

  // Extract property names
  const propertyNames = ['vertica', 'epic', 'bayu', 'bora', 'vivo', 'rubica',
    'acacia', 'astoria', 'platinum', 'avila', 'perla', 'azure', 'emporis',
    'armani', 'highpark', 'meta', 'netizen', 'rica', 'birch', 'unio',
    'arte', 'trion', 'razak', 'ooak', 'majestic', 'secoya', 'andes']
  for (const p of propertyNames) {
    if (text.includes(p)) keywords.add(p)
  }

  return Array.from(keywords).slice(0, 20)
}

export function messageMatchesIssue(content: string, issue: Issue): boolean {
  const keywords = issue.thread_keywords ?? []
  if (keywords.length === 0) return false

  const lower = content.toLowerCase()
  let matchCount = 0

  for (const kw of keywords) {
    if (lower.includes(kw)) matchCount++
  }

  if (matchCount >= 2) return true

  if (matchCount === 1) {
    const issueAge = Date.now() - new Date(issue.created_at).getTime()
    if (issueAge < 6 * 60 * 60 * 1000) return true
  }

  return false
}

export async function linkMessageToIssue(
  message: LarkGroupMessage,
  issue: Issue
): Promise<void> {
  try {
    const isLee = message.sender_open_id === LEE_OPEN_ID

    await supabaseAdmin.from('issue_timeline_entries').insert({
      issue_id: issue.id,
      entry_type: 'message',
      sender_name: message.sender_name,
      sender_open_id: message.sender_open_id,
      content: message.content,
      lark_message_id: message.message_id,
      is_lee: isLee,
    })

    await supabaseAdmin
      .from('lark_issues')
      .update({
        last_message_at: message.message_time,
        message_count: (issue.message_count ?? 0) + 1,
        silence_hours: 0,
        has_lee_replied: isLee ? true : issue.has_lee_replied,
      })
      .eq('id', issue.id)

    // Check for auto-resolution
    const lower = message.content.toLowerCase()
    const isResolution = RESOLUTION_KEYWORDS.some(kw => lower.includes(kw))

    if (isResolution && !isLee) {
      await supabaseAdmin.from('issue_timeline_entries').insert({
        issue_id: issue.id,
        entry_type: 'resolution',
        sender_name: message.sender_name,
        content: `Auto-detected resolution: "${message.content.slice(0, 100)}"`,
      })

      await supabaseAdmin
        .from('lark_issues')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: message.sender_name,
        })
        .eq('id', issue.id)

      // DM Lee
      if (LEE_OPEN_ID) {
        const dm = `✅ Issue auto-resolved in ${issue.cluster}\n${issue.title}\nResolved by: ${message.sender_name}\nView: https://belive-nucleus.vercel.app/issues`
        sendLarkMessage(LEE_OPEN_ID, dm, 'open_id').catch(console.error)
      }
    }
  } catch (error) {
    console.error('[thread:link]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function processNewMessages(
  messages: LarkGroupMessage[],
  cluster: string
): Promise<void> {
  try {
    const { data: openIssues } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('cluster', cluster)
      .eq('status', 'open')

    if (!openIssues || openIssues.length === 0) return

    // Ensure keywords populated
    for (const issue of openIssues) {
      if (!issue.thread_keywords || issue.thread_keywords.length === 0) {
        const keywords = extractKeywords(issue.title)
        await supabaseAdmin
          .from('lark_issues')
          .update({ thread_keywords: keywords })
          .eq('id', issue.id)
        issue.thread_keywords = keywords
      }
    }

    for (const msg of messages) {
      let linked = false
      for (const issue of openIssues) {
        if (messageMatchesIssue(msg.content, { ...issue, days_open: 0 })) {
          await linkMessageToIssue(msg, { ...issue, days_open: 0 })
          linked = true
          break
        }
      }
      if (!linked) {
        console.log(`[thread:unmatched:${cluster}]`, msg.content.slice(0, 60))
      }
    }
  } catch (error) {
    console.error('[thread:process]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function checkSilenceGaps(cluster: string): Promise<void> {
  try {
    const { data: issues } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('cluster', cluster)
      .eq('status', 'open')
      .not('last_message_at', 'is', null)

    if (!issues) return

    const now = Date.now()

    for (const issue of issues) {
      const lastMsg = new Date(issue.last_message_at).getTime()
      const silenceHours = Math.round((now - lastMsg) / 3600000 * 10) / 10

      await supabaseAdmin
        .from('lark_issues')
        .update({ silence_hours: silenceHours })
        .eq('id', issue.id)

      const threshold = SILENCE_ALERT_HOURS[issue.priority] ?? 6
      if (silenceHours > threshold) {
        // Check if last timeline entry is already a silence_gap
        const { data: lastEntry } = await supabaseAdmin
          .from('issue_timeline_entries')
          .select('entry_type')
          .eq('issue_id', issue.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (!lastEntry || lastEntry.entry_type !== 'silence_gap') {
          await supabaseAdmin.from('issue_timeline_entries').insert({
            issue_id: issue.id,
            entry_type: 'silence_gap',
            content: `No updates from team for ${Math.round(silenceHours)}h`,
            metadata: { gap_hours: silenceHours },
          })
        }
      }
    }
  } catch (error) {
    console.error('[thread:silence]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function generateThreadSummary(issueId: string): Promise<string> {
  try {
    const { data: entries } = await supabaseAdmin
      .from('issue_timeline_entries')
      .select('*')
      .eq('issue_id', issueId)
      .order('created_at', { ascending: true })
      .limit(20)

    const { data: issue } = await supabaseAdmin
      .from('lark_issues')
      .select('title, cluster')
      .eq('id', issueId)
      .single()

    if (!entries || entries.length === 0) {
      return 'No conversation data yet. Run a cluster scan to populate.'
    }

    const conversation = entries
      .map(e => {
        const time = formatDistanceToNow(new Date(e.created_at), { addSuffix: true })
        const name = e.sender_name ?? (e.entry_type === 'silence_gap' ? '⏸ Silence' : 'System')
        return `${name} [${time}]: ${e.content}`
      })
      .join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You summarize BeLive Property Hub team conversations about maintenance and ops issues. Be concise. Focus on: what action was taken, what is the current status, what is blocked, who is responsible, what is the next expected step. Write in 2-3 sentences max. Plain text, no bullet points. If team resolved it, say so clearly.`,
      messages: [{
        role: 'user',
        content: `Issue: ${issue?.title ?? 'Unknown'} (${issue?.cluster ?? ''})\n\nConversation:\n${conversation}`,
      }],
    })

    const summary = msg.content[0].type === 'text' ? msg.content[0].text : ''

    await supabaseAdmin
      .from('lark_issues')
      .update({ ai_summary: summary, ai_summary_at: new Date().toISOString() })
      .eq('id', issueId)

    await supabaseAdmin.from('issue_timeline_entries').insert({
      issue_id: issueId,
      entry_type: 'ai_summary',
      content: summary,
      metadata: { summary_at: new Date().toISOString() },
    })

    return summary
  } catch (error) {
    console.error('[thread:summary]', error instanceof Error ? error.message : 'Unknown')
    return 'Summary generation failed.'
  }
}
