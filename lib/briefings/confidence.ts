import { supabaseAdmin } from '@/lib/supabase-admin'

export async function updateConfidenceTracking(
  reportType: string,
  approved: boolean
): Promise<void> {
  try {
    const { data: config } = await supabaseAdmin
      .from('briefing_autosend_config')
      .select('*')
      .eq('report_type', reportType)
      .single()

    if (!config) return

    const newConsecutive = approved
      ? (config.consecutive_approvals as number) + 1
      : 0 // reset on discard

    const newTotal = (config.total_approvals as number) + (approved ? 1 : 0)
    const newReviews = (config.total_reviews as number) + 1
    const newRate = newReviews > 0 ? Math.round((newTotal / newReviews) * 100) : 0
    const nowEligible = newConsecutive >= (config.required_consecutive_approvals as number)

    await supabaseAdmin
      .from('briefing_autosend_config')
      .update({
        consecutive_approvals: newConsecutive,
        total_approvals: newTotal,
        total_reviews: newReviews,
        approval_rate: newRate,
        auto_send_eligible: nowEligible,
        last_approved_at: approved ? new Date().toISOString() : config.last_approved_at,
        last_sent_at: approved ? new Date().toISOString() : config.last_sent_at,
      })
      .eq('report_type', reportType)
  } catch (error) {
    console.error('[confidence]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function resetConfidenceOnDiscard(reportType: string): Promise<void> {
  await updateConfidenceTracking(reportType, false)
}
