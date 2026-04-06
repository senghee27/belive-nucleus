import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { generateReport } from './report-generator'
import type { GenerationLog } from './report-generator'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''

export async function runMiddayScan(cluster: string): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    const { data: session } = await supabaseAdmin
      .from('standup_sessions')
      .select('*')
      .eq('session_date', today)
      .eq('cluster', cluster)
      .single()

    if (!session) return

    // Get messages since 8:30am
    const since = new Date()
    since.setHours(0, 30, 0, 0) // 00:30 UTC = 8:30 MYT
    const { data: msgs } = await supabaseAdmin
      .from('lark_group_messages')
      .select('sender_name, content')
      .eq('cluster', cluster)
      .gte('created_at', since.toISOString())
      .limit(20)

    const commitments = session.report_extracted ? JSON.stringify(session.report_extracted) : 'No standup report'
    const activity = (msgs ?? []).map(m => `${m.sender_name}: ${m.content?.slice(0, 60)}`).join('\n')

    const msg = await aiClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: 'Assess midday progress for BeLive cluster. What was committed vs what is being executed? Any blockers? Anything slipping? 3-4 sentences max.',
      messages: [{ role: 'user', content: `Commitments:\n${commitments}\n\nActivity since 9am:\n${activity || 'No messages'}` }],
    })

    const summary = msg.content[0].type === 'text' ? msg.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim() : ''

    await supabaseAdmin.from('standup_sessions').update({
      midday_scanned: true, midday_scanned_at: new Date().toISOString(),
      midday_summary: summary,
    }).eq('id', session.id)

    await supabaseAdmin.from('daily_messages').insert({
      session_id: session.id, cluster, session_date: today,
      message_type: 'midday_scan', direction: 'outbound',
      content_text: summary, sender_name: 'Nucleus',
      sent_at: new Date().toISOString(),
    })

    // Create report record
    const log: GenerationLog = {
      sources_read: [
        { name: 'Standup Session', scanned_at: new Date().toISOString(), record_count: 1, success: true },
        { name: 'Cluster Messages', scanned_at: new Date().toISOString(), record_count: (msgs ?? []).length, success: true },
      ],
      ai_reasoning: `Midday pulse for ${cluster}`,
      processing_start: new Date().toISOString(),
      processing_end: new Date().toISOString(),
      duration_seconds: 0,
      tokens_used: msg.usage?.output_tokens ?? 0,
      model: 'claude-sonnet-4-6',
      errors: [],
    }

    await generateReport({
      report_type: 'MIDDAY_PULSE',
      report_name: `Midday Pulse — ${cluster}`,
      cluster,
      scheduled_for: new Date(),
      content: summary,
      generation_log: log,
      destinations: LEE_OPEN_ID ? [{ chat_id: LEE_OPEN_ID, name: 'Lee DM', type: 'lee_dm' as const, selected: true }] : [],
    })
  } catch (error) {
    console.error(`[midday:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
  }
}

export async function runAllMiddayScans(): Promise<void> {
  const clusters = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11']
  for (const c of clusters) {
    await runMiddayScan(c)
  }
}
