import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendLarkMessage } from '@/lib/lark'
import { getActiveGroups } from '@/lib/monitored-groups'
import { createIncident } from '@/lib/incidents'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function generateMorningBriefing(cluster: string, chatId: string): Promise<string> {
  try {
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('title, severity, priority, status, ai_summary')
      .eq('cluster', cluster)
      .not('status', 'in', '("resolved","archived")')
      .limit(10)

    const since = new Date(Date.now() - 14 * 3600000).toISOString()
    const { data: messages } = await supabaseAdmin
      .from('lark_group_messages')
      .select('sender_name, content')
      .eq('cluster', cluster)
      .gte('created_at', since)
      .order('message_time', { ascending: false })
      .limit(30)

    const incidentsSummary = (incidents ?? []).map(i => `[${i.severity}/${i.priority}] ${i.title}${i.ai_summary ? ' — ' + i.ai_summary : ''}`).join('\n') || 'No open incidents'
    const messagesSummary = (messages ?? []).map(m => `${m.sender_name}: ${m.content}`).join('\n') || 'No recent messages'

    const msg = await aiClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 800,
      system: `Generate Lee Seng Hee's morning briefing for his ops team. Direct, decisive, Manglish. Name people, give deadlines. Max 200 words. Plain text for Lark.`,
      messages: [{ role: 'user', content: `${cluster} briefing.\n\nOpen incidents:\n${incidentsSummary}\n\nOvernight:\n${messagesSummary}` }],
    })

    return msg.content[0].type === 'text' ? msg.content[0].text : '[Briefing failed]'
  } catch (error) {
    console.error(`[briefing:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
    return `[Briefing failed for ${cluster}]`
  }
}

export async function sendMorningBriefings() {
  const groups = await getActiveGroups()
  const results: Record<string, { sent: boolean }> = {}

  for (const group of groups) {
    try {
      const briefing = await generateMorningBriefing(group.cluster, group.chat_id)
      const sent = await sendLarkMessage(group.chat_id, briefing)

      await createIncident({
        source: 'lark_scan', chat_id: group.chat_id, cluster: group.cluster,
        group_name: group.group_name, monitored_group_id: group.id,
        agent: 'coo', problem_type: 'morning_briefing',
        priority: 'P3', severity: 'GREEN',
        title: `Morning briefing for ${group.cluster}`,
        raw_content: briefing,
      })

      results[group.cluster] = { sent }
    } catch (error) {
      console.error(`[briefing:${group.cluster}]`, error instanceof Error ? error.message : 'Unknown')
      results[group.cluster] = { sent: false }
    }
  }

  return results
}
