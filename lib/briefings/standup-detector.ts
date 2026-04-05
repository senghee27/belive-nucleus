import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

const aiClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const IOE_NAMES: Record<string, string[]> = {
  C1: ['Nureen'], C2: ['Intan'], C3: ['Aireen'], C4: ['Aliya', 'Nureen'],
  C5: ['Aliya'], C6: ['Intan'], C7: ['Mardhiah', 'Aireen'], C8: ['Mardhiah'],
  C9: ['Intan', 'Aliya'], C10: ['Nureen', 'Aliya'], C11: ['Airen', 'Mardhiah'],
}

export function isStandupReport(content: string, senderName: string | null, cluster: string): number {
  let score = 0
  const lower = content.toLowerCase()
  const nowMYT = new Date(Date.now() + 8 * 3600000)
  const hour = nowMYT.getUTCHours()

  // Sender is known IOE
  const ioeNames = IOE_NAMES[cluster] ?? []
  if (senderName && ioeNames.some(n => senderName.toLowerCase().includes(n.toLowerCase()))) score += 30

  // Time window: 9am-11:30am MYT
  if (hour >= 9 && hour < 12) score += 20
  if (hour < 9 || hour >= 12) score -= 30

  // Keywords
  if (/move.?in|MI|masuk/i.test(lower)) score += 15
  if (/move.?out|MO|keluar|turnaround/i.test(lower)) score += 15
  if (/tech|patrol|ticket|technician|task/i.test(lower)) score += 15
  if (/risk|priority|urgent|escalate|pending/i.test(lower)) score += 10
  if (/report|standup|daily|update|hari ni/i.test(lower)) score += 10
  if (content.length > 100) score += 10

  // Negative: sender is OOE/Tech
  if (senderName && /adam|johan|faris|ayad|safie/i.test(senderName)) score -= 20

  return Math.max(0, Math.min(100, score))
}

export async function extractStandupData(content: string, cluster: string): Promise<Record<string, unknown>> {
  try {
    const msg = await aiClient.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: `Extract structured data from IOE standup report. Extract exactly what is mentioned. If not mentioned, use null or empty array. Respond ONLY valid JSON:
{"move_in":{"count":0,"units":[]},"move_out":{"count":0,"units":[]},"patrol":{"units":[],"notes":null},"tech_tasks":[],"risks":[],"priorities":[],"escalations":[]}`,
      messages: [{ role: 'user', content: `Cluster ${cluster} IOE report:\n${content}` }],
    })

    let text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
    return JSON.parse(text)
  } catch (error) {
    console.error('[standup:extract]', error instanceof Error ? error.message : 'Unknown')
    return {}
  }
}

export async function processIncomingClusterMessage(
  content: string,
  senderName: string | null,
  senderOpenId: string | null,
  cluster: string,
  chatId: string
): Promise<void> {
  try {
    const today = new Date().toISOString().split('T')[0]

    // Check if session exists and report already detected
    const { data: session } = await supabaseAdmin
      .from('standup_sessions')
      .select('id, report_detected')
      .eq('session_date', today)
      .eq('cluster', cluster)
      .single()

    if (session?.report_detected) return

    // Check confidence
    const confidence = isStandupReport(content, senderName, cluster)
    if (confidence < 40) return

    // Extract data
    const extracted = await extractStandupData(content, cluster)

    // Upsert session
    await supabaseAdmin.from('standup_sessions').upsert({
      session_date: today, cluster, chat_id: chatId,
      report_detected: true, report_detected_at: new Date().toISOString(),
      report_raw_content: content, report_sender_name: senderName,
      report_sender_open_id: senderOpenId, report_confidence: confidence,
      report_extracted: extracted, compliance_status: 'compliant',
    }, { onConflict: 'session_date,cluster' })

    // Insert daily message
    await supabaseAdmin.from('daily_messages').insert({
      cluster, session_date: today, message_type: 'standup_report',
      direction: 'inbound', content_text: content, sender_name: senderName,
      sent_at: new Date().toISOString(),
      metadata: { confidence, extracted },
    })

    // Update cluster health
    await supabaseAdmin.from('cluster_health_cache').update({
      today_compliance: 'compliant', standup_report_at: new Date().toISOString(),
    }).eq('cluster', cluster)

    console.log(`[standup:${cluster}]`, `Report detected from ${senderName} (confidence: ${confidence})`)
  } catch (error) {
    console.error(`[standup:${cluster}]`, error instanceof Error ? error.message : 'Unknown')
  }
}
