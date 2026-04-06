import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getActiveGroups } from '@/lib/monitored-groups'
import { generateReport } from './report-generator'
import type { GenerationLog, Destination } from './report-generator'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''

export async function generateMorningBriefContent(): Promise<{
  content: string
  log: GenerationLog
  destinations: Destination[]
}> {
  const processingStart = new Date().toISOString()
  const sources: GenerationLog['sources_read'] = []
  const errors: string[] = []

  // Gather data from all clusters
  const { data: incidents } = await supabaseAdmin
    .from('incidents')
    .select('title, severity, priority, status, cluster, ai_summary')
    .not('status', 'in', '("resolved","archived")')
    .limit(30)

  sources.push({ name: 'Incidents', scanned_at: new Date().toISOString(), record_count: incidents?.length ?? 0, success: true })

  const since = new Date(Date.now() - 14 * 3600000).toISOString()
  const { data: messages } = await supabaseAdmin
    .from('lark_group_messages')
    .select('cluster, sender_name, content')
    .gte('created_at', since)
    .order('message_time', { ascending: false })
    .limit(50)

  sources.push({ name: 'Cluster Messages (14h)', scanned_at: new Date().toISOString(), record_count: messages?.length ?? 0, success: true })

  const { data: tickets } = await supabaseAdmin
    .from('ai_report_tickets')
    .select('ticket_id, cluster, unit_number, issue_description, age_days, sla_overdue')
    .eq('status', 'open')
    .order('age_days', { ascending: false })
    .limit(20)

  sources.push({ name: 'AI Report Tickets', scanned_at: new Date().toISOString(), record_count: tickets?.length ?? 0, success: true })

  const { data: healthData } = await supabaseAdmin
    .from('cluster_health_cache')
    .select('cluster, health_status, health_score')
    .order('health_score', { ascending: true })

  sources.push({ name: 'Cluster Health', scanned_at: new Date().toISOString(), record_count: healthData?.length ?? 0, success: true })

  const incidentsSummary = (incidents ?? []).map(i => `[${i.severity}/${i.priority}/${i.cluster}] ${i.title}`).join('\n') || 'No open incidents'
  const ticketSummary = (tickets ?? []).slice(0, 10).map(t => `${t.ticket_id} ${t.cluster} ${t.unit_number} — ${t.issue_description} (${t.age_days}d${t.sla_overdue ? ' OVERDUE' : ''})`).join('\n') || 'No tickets'
  const healthSummary = (healthData ?? []).map(h => `${h.cluster}: ${h.health_status} (${h.health_score})`).join(', ')

  const msg = await aiClient.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: `Generate Lee Seng Hee's Morning Intelligence Briefing for BeLive Property Hub. Cover: critical items (SLA breaches, P1s), cluster health overview, overnight activity highlights, today's priorities. Direct, Manglish, name people. Max 400 words. Plain text for Lark.`,
    messages: [{ role: 'user', content: `Open incidents:\n${incidentsSummary}\n\nTop tickets:\n${ticketSummary}\n\nCluster health:\n${healthSummary}\n\nOvernight messages:\n${(messages ?? []).slice(0, 15).map(m => `[${m.cluster}] ${m.sender_name}: ${m.content?.slice(0, 60)}`).join('\n')}` }],
  })

  const content = msg.content[0].type === 'text' ? msg.content[0].text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim() : '[Briefing generation failed]'

  const processingEnd = new Date().toISOString()
  const log: GenerationLog = {
    sources_read: sources,
    ai_reasoning: `Generated morning brief from ${incidents?.length ?? 0} incidents, ${tickets?.length ?? 0} tickets, ${messages?.length ?? 0} messages across all clusters`,
    processing_start: processingStart,
    processing_end: processingEnd,
    duration_seconds: Math.round((new Date(processingEnd).getTime() - new Date(processingStart).getTime()) / 1000),
    tokens_used: msg.usage?.output_tokens ?? 0,
    model: 'claude-sonnet-4-6',
    errors,
  }

  const destinations: Destination[] = [
    ...(LEE_OPEN_ID ? [{ chat_id: LEE_OPEN_ID, name: 'Lee DM', type: 'lee_dm' as const, selected: true }] : []),
  ]

  return { content, log, destinations }
}

export async function generateMorningBriefing(cluster: string, _chatId: string): Promise<string> {
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

export async function sendMorningBriefings(triggeredBy: 'cron' | 'manual' = 'cron', triggeredByUser?: string) {
  const { startCronRun, completeCronRun } = await import('./cron-logger')
  const runId = await startCronRun({ report_type: 'MORNING_BRIEF', triggered_by: triggeredBy, triggered_by_user: triggeredByUser })

  try {
    const { content, log, destinations } = await generateMorningBriefContent()
    const reportId = await generateReport({
      report_type: 'MORNING_BRIEF',
      report_name: 'Morning Intelligence Briefing',
      scheduled_for: new Date(),
      content,
      generation_log: log,
      destinations,
    })

    await completeCronRun(runId, {
      status: 'success',
      report_id: reportId,
      sources_succeeded: log.sources_read.map(s => ({ name: s.name, type: 'db', completed_at: s.scanned_at, record_count: s.record_count })),
      tokens_used: log.tokens_used,
      model: log.model,
    })

    return { report_id: reportId, run_id: runId }
  } catch (error) {
    await completeCronRun(runId, { status: 'failed', error_message: error instanceof Error ? error.message : 'Unknown' })
    throw error
  }
}
