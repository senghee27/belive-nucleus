import { supabaseAdmin } from '@/lib/supabase-admin'

export type CronSource = {
  name: string
  type: string
  attempted_at?: string
  completed_at?: string
  record_count?: number
  error?: string
}

export async function startCronRun(params: {
  report_type: string
  cluster?: string
  triggered_by?: 'cron' | 'manual' | 'retry'
  triggered_by_user?: string
}): Promise<string> {
  try {
    const { data, error } = await supabaseAdmin
      .from('briefing_cron_runs')
      .insert({
        report_type: params.report_type,
        cluster: params.cluster ?? null,
        triggered_by: params.triggered_by ?? 'cron',
        triggered_by_user: params.triggered_by_user ?? null,
        started_at: new Date().toISOString(),
        status: 'running',
      })
      .select('id')
      .single()

    if (error) throw new Error(error.message)
    return data!.id as string
  } catch (error) {
    console.error('[cron-logger:start]', error instanceof Error ? error.message : 'Unknown')
    return 'unknown'
  }
}

export async function completeCronRun(
  runId: string,
  result: {
    status: 'success' | 'failed' | 'skipped'
    report_id?: string
    error_message?: string
    skip_reason?: string
    sources_attempted?: CronSource[]
    sources_succeeded?: CronSource[]
    sources_failed?: CronSource[]
    tokens_used?: number
    model?: string
  }
): Promise<void> {
  if (runId === 'unknown') return

  try {
    const completedAt = new Date()

    const { data: run } = await supabaseAdmin
      .from('briefing_cron_runs')
      .select('started_at, report_type')
      .eq('id', runId)
      .single()

    const durationSeconds = run
      ? Math.round((completedAt.getTime() - new Date(run.started_at as string).getTime()) / 1000)
      : null

    await supabaseAdmin
      .from('briefing_cron_runs')
      .update({
        status: result.status,
        completed_at: completedAt.toISOString(),
        duration_seconds: durationSeconds,
        report_id: result.report_id ?? null,
        error_message: result.error_message ?? null,
        skip_reason: result.skip_reason ?? null,
        sources_attempted: result.sources_attempted ?? [],
        sources_succeeded: result.sources_succeeded ?? [],
        sources_failed: result.sources_failed ?? [],
        tokens_used: result.tokens_used ?? null,
        model: result.model ?? null,
      })
      .eq('id', runId)

    // Update schedule config stats
    if (run) {
      const reportType = run.report_type as string
      const { data: config } = await supabaseAdmin
        .from('briefing_schedule_config')
        .select('total_runs, successful_runs, failed_runs')
        .eq('report_type', reportType)
        .single()

      if (config) {
        const totalRuns = (config.total_runs as number) + 1
        const successfulRuns = (config.successful_runs as number) + (result.status === 'success' ? 1 : 0)
        const failedRuns = (config.failed_runs as number) + (result.status === 'failed' ? 1 : 0)
        const successRate = totalRuns > 0 ? Math.round((successfulRuns / totalRuns) * 100) : 0

        await supabaseAdmin
          .from('briefing_schedule_config')
          .update({
            last_run_at: completedAt.toISOString(),
            last_run_status: result.status,
            last_report_id: result.report_id ?? null,
            total_runs: totalRuns,
            successful_runs: successfulRuns,
            failed_runs: failedRuns,
            success_rate: successRate,
          })
          .eq('report_type', reportType)
      }
    }
  } catch (error) {
    console.error('[cron-logger:complete]', error instanceof Error ? error.message : 'Unknown')
  }
}
