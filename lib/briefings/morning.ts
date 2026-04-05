import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendGroupMessage } from '@/lib/lark-groups'
import { getActiveGroups } from '@/lib/monitored-groups'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateMorningBriefing(
  cluster: string,
  chatId: string
): Promise<string> {
  try {
    // Fetch open issues for this cluster
    const { data: issues } = await supabaseAdmin
      .from('lark_issues')
      .select('*')
      .eq('cluster', cluster)
      .eq('status', 'open')
      .order('created_at', { ascending: false })
      .limit(10)

    // Fetch messages from last 14 hours
    const since = new Date(Date.now() - 14 * 60 * 60 * 1000).toISOString()
    const { data: messages } = await supabaseAdmin
      .from('lark_group_messages')
      .select('sender_name, content, message_time')
      .eq('cluster', cluster)
      .gte('created_at', since)
      .order('message_time', { ascending: false })
      .limit(30)

    const issuesSummary = (issues ?? []).map(i => `- [${i.severity}] ${i.title} (${i.days_open}d open)`).join('\n') || 'No open issues'
    const messagesSummary = (messages ?? []).map(m => `${m.sender_name}: ${m.content}`).join('\n') || 'No recent messages'

    const msg = await aiClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `You are generating Lee Seng Hee's morning intelligence briefing for his cluster operations team.
Lee is Group CEO of BeLive Property Hub — 3,000 rooms, 11 clusters, Malaysia.

Style rules:
- Write in Lee's voice — direct, decisive, Manglish where natural
- Name specific people where relevant
- Include specific deadlines (not "soon" — say "by 12pm today" or "within 2 hours")
- Show you've read the overnight situation — reference specific issues
- End with 1-2 key priorities for the day
- Maximum 200 words
- NOT a template — vary structure each day
- Tone: firm but caring, coaching not commanding

Format: plain text, no markdown, ready to send in Lark.`,
      messages: [{
        role: 'user',
        content: `Generate the morning briefing for ${cluster}.

Open issues:
${issuesSummary}

Overnight messages:
${messagesSummary}`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : ''
    return text
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error(`[briefing:${cluster}]`, message)
    return `[Briefing generation failed for ${cluster}]`
  }
}

export async function sendMorningBriefings() {
  const results: Record<string, { sent: boolean; briefing: string }> = {}

  const groups = await getActiveGroups()
  for (const group of groups) {
    const cluster = group.cluster
    const chatId = group.chat_id
    try {
      const briefing = await generateMorningBriefing(cluster, chatId)

      const messageId = await sendGroupMessage(chatId, briefing, true)
      const sent = messageId !== null

      // Log to decisions table
      await supabaseAdmin.from('decisions').insert({
        source: 'lark',
        agent: 'coo',
        problem_type: 'morning_briefing',
        priority: 'P3',
        ai_summary: `Morning briefing for ${cluster}`,
        ai_proposal: briefing,
        ai_reasoning: 'Automated morning intelligence briefing',
        ai_confidence: 95,
        status: 'approved',
        final_reply: briefing,
        auto_executed: true,
        sent_at: sent ? new Date().toISOString() : null,
      })

      results[cluster] = { sent, briefing }
      console.log(`[briefing:${cluster}]`, sent ? 'Sent' : 'Failed to send')
    } catch (error) {
      console.error(`[briefing:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
      results[cluster] = { sent: false, briefing: '' }
    }
  }

  return results
}
