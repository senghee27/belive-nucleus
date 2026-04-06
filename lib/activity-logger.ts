import { supabaseAdmin } from './supabase-admin'

type EventType = 'MESSAGE_RECEIVED' | 'AI_CLASSIFIED' | 'INCIDENT_CREATED' | 'LEE_ACTION' | 'SYSTEM_SENT' | 'SCHEDULED_JOB' | 'ERROR'

interface LogEntry {
  event_type: EventType
  event_subtype?: string
  cluster?: string
  group_name?: string
  chat_id?: string
  summary: string
  detail?: Record<string, unknown>
  incident_id?: string
  lark_message_id?: string
  success?: boolean
  error_message?: string
}

async function resolveStaffName(openId: string): Promise<string> {
  if (!openId || !openId.startsWith('ou_')) return openId
  try {
    const { data } = await supabaseAdmin.from('staff_directory').select('name').eq('open_id', openId).single()
    return data?.name ?? openId
  } catch { return openId }
}

async function log(entry: LogEntry): Promise<void> {
  try {
    await supabaseAdmin.from('nucleus_activity_log').insert({
      ...entry,
      expires_at: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
    })
  } catch (error) {
    console.error('[activity-logger]', error instanceof Error ? error.message : 'Log failed')
  }
}

export const logger = {
  messageReceived: async (p: { messageId: string; senderName: string; cluster: string; groupName: string; chatId: string; contentPreview: string; contentLength: number; noisePassed: boolean }) => {
    const name = await resolveStaffName(p.senderName)
    return log({
      event_type: 'MESSAGE_RECEIVED', cluster: p.cluster, group_name: p.groupName, chat_id: p.chatId, lark_message_id: p.messageId,
      summary: `${name} in ${p.groupName} — ${p.contentPreview.slice(0, 60)}`,
      detail: { message_id: p.messageId, sender_name: name, content_preview: p.contentPreview, content_length: p.contentLength, noise_filter: p.noisePassed ? 'passed' : 'blocked' },
    })
  },

  aiClassified: (p: { inputContent: string; cluster: string; agent: string; category: string; severity: string; priority: string; confidence: number; isIncident: boolean; processingMs: number }) =>
    log({
      event_type: 'AI_CLASSIFIED', cluster: p.cluster,
      summary: `AI: ${p.category} · ${p.severity} · ${p.priority} · ${p.confidence}% confidence`,
      detail: { input_content: p.inputContent.slice(0, 200), agent: p.agent, category: p.category, severity: p.severity, priority: p.priority, confidence: p.confidence, is_incident: p.isIncident, processing_time_ms: p.processingMs },
    }),

  incidentCreated: (p: { incidentId: string; title: string; cluster: string; trigger: string; priority: string; severity: string; confidence: number }) =>
    log({
      event_type: 'INCIDENT_CREATED', cluster: p.cluster, incident_id: p.incidentId,
      summary: `Incident: "${p.title.slice(0, 60)}" · ${p.priority} ${p.severity}`,
      detail: { incident_id: p.incidentId, title: p.title, trigger: p.trigger, priority: p.priority, severity: p.severity, proposal_confidence: p.confidence },
    }),

  leeAction: (p: { action: string; incidentId: string; incidentTitle: string; cluster: string; editSummary?: string }) =>
    log({
      event_type: 'LEE_ACTION', event_subtype: p.action, cluster: p.cluster, incident_id: p.incidentId,
      summary: `Lee ${p.action}: "${p.incidentTitle.slice(0, 50)}"${p.editSummary ? ` — ${p.editSummary}` : ''}`,
      detail: { action: p.action, incident_id: p.incidentId, incident_title: p.incidentTitle, edit_summary: p.editSummary },
    }),

  systemSent: (p: { messageType: string; recipientName: string; chatId: string; cluster?: string; messagePreview: string; success: boolean; errorMessage?: string }) =>
    log({
      event_type: 'SYSTEM_SENT', event_subtype: p.messageType, cluster: p.cluster, chat_id: p.chatId,
      summary: `Sent ${p.messageType} to ${p.recipientName} — ${p.success ? '✓' : '✗ failed'}`,
      success: p.success, error_message: p.errorMessage,
      detail: { message_type: p.messageType, recipient_name: p.recipientName, message_preview: p.messagePreview.slice(0, 100), success: p.success },
    }),

  scheduledJob: (p: { jobName: string; clustersProcessed: string[]; successes: number; failures: number; durationSeconds: number; detail?: Record<string, unknown> }) =>
    log({
      event_type: 'SCHEDULED_JOB', event_subtype: p.jobName, cluster: 'ALL',
      summary: `${p.jobName}: ${p.successes}/${p.clustersProcessed.length} clusters · ${p.durationSeconds}s`,
      success: p.failures === 0,
      detail: { job_name: p.jobName, clusters_processed: p.clustersProcessed, successes: p.successes, failures: p.failures, duration_seconds: p.durationSeconds, ...p.detail },
    }),

  error: (p: { errorType: string; context: string; message: string; fallback?: string; cluster?: string }) =>
    log({
      event_type: 'ERROR', cluster: p.cluster,
      summary: `Error: ${p.context} — ${p.message.slice(0, 80)}`,
      success: false, error_message: p.message,
      detail: { error_type: p.errorType, context: p.context, error_message: p.message, fallback_taken: p.fallback },
    }),
}
