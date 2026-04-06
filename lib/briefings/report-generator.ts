import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendLarkMessage } from '@/lib/lark'
import { updateConfidenceTracking } from './confidence'

export type Destination = {
  chat_id: string
  name: string
  type: 'cluster_group' | 'function_group' | 'lee_dm' | 'ai_report'
  selected: boolean
}

export type SourceRead = {
  name: string
  scanned_at: string
  record_count: number
  success: boolean
}

export type GenerationLog = {
  sources_read: SourceRead[]
  ai_reasoning: string
  processing_start: string
  processing_end: string
  duration_seconds: number
  tokens_used: number
  model: string
  errors: string[]
}

export async function generateReport(params: {
  report_type: string
  report_name: string
  cluster?: string
  scheduled_for: Date
  content: string
  generation_log: GenerationLog
  destinations: Destination[]
}): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from('briefing_reports')
      .insert({
        report_type: params.report_type,
        report_name: params.report_name,
        cluster: params.cluster ?? null,
        scheduled_for: params.scheduled_for.toISOString(),
        generated_at: new Date().toISOString(),
        content: params.content,
        content_original: params.content,
        generation_log: params.generation_log,
        destinations: params.destinations,
        status: 'draft',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    const reportId = data!.id as string

    // Check auto-send config
    const { data: config } = await supabaseAdmin
      .from('briefing_autosend_config')
      .select('auto_send_enabled')
      .eq('report_type', params.report_type)
      .single()

    if (config?.auto_send_enabled) {
      await sendReport(reportId, true)
    }

    return reportId
  } catch (error) {
    console.error('[report-generator]', error instanceof Error ? error.message : 'Unknown')
    throw error
  }
}

export async function sendReport(reportId: string, wasAutoSent = false): Promise<void> {
  const { data: report, error } = await supabaseAdmin
    .from('briefing_reports')
    .select('*')
    .eq('id', reportId)
    .single()

  if (error || !report) throw new Error(error?.message ?? 'Report not found')

  const destinations = (report.destinations as Destination[]).filter(d => d.selected)
  const sendResults: { chat_id: string; name: string; success: boolean; error?: string }[] = []

  for (const dest of destinations) {
    try {
      // Determine receive_id_type based on destination type
      const receiveIdType = dest.type === 'lee_dm' ? 'open_id' : 'chat_id'
      const sent = await sendLarkMessage(dest.chat_id, report.content as string, receiveIdType)
      sendResults.push({ chat_id: dest.chat_id, name: dest.name, success: sent })
    } catch (err) {
      sendResults.push({ chat_id: dest.chat_id, name: dest.name, success: false, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  const allSuccess = sendResults.length > 0 && sendResults.every(r => r.success)

  await supabaseAdmin
    .from('briefing_reports')
    .update({
      status: allSuccess ? 'sent' : (sendResults.some(r => r.success) ? 'sent' : 'failed'),
      sent_at: new Date().toISOString(),
      sent_to: sendResults,
      send_error: allSuccess ? null : sendResults.filter(r => !r.success).map(r => `${r.name}: ${r.error ?? 'failed'}`).join('; '),
      was_auto_sent: wasAutoSent,
      lee_approved_at: wasAutoSent ? null : new Date().toISOString(),
    })
    .eq('id', reportId)

  // Update auto-send confidence tracking
  await updateConfidenceTracking(report.report_type as string, true)

  // Log to watchdog
  try {
    const { logger } = await import('@/lib/activity-logger')
    logger.systemSent({
      messageType: `briefing_${report.report_type}`,
      recipientName: destinations.map(d => d.name).join(', '),
      chatId: destinations[0]?.chat_id ?? '',
      cluster: (report.cluster as string) ?? undefined,
      messagePreview: (report.content as string).slice(0, 100),
      success: allSuccess,
      errorMessage: allSuccess ? undefined : 'One or more destinations failed',
    }).catch(() => {})
  } catch { /* ignore */ }
}

export async function sendBatchReports(reportIds: string[]): Promise<{ id: string; success: boolean; error?: string }[]> {
  const results: { id: string; success: boolean; error?: string }[] = []

  for (const id of reportIds) {
    try {
      await sendReport(id, false)
      results.push({ id, success: true })
    } catch (err) {
      results.push({ id, success: false, error: err instanceof Error ? err.message : 'Unknown' })
    }
  }

  return results
}
