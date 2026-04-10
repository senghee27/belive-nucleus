import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ category: string }> }
) {
  try {
    const { category } = await params
    const { enabled } = await req.json()

    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled (boolean) required' }, { status: 400 })
    }

    const { error } = await supabaseAdmin
      .from('category_learning_stats')
      .update({ auto_send_enabled: enabled })
      .eq('category', category)

    if (error) throw new Error(error.message)

    // Log to watchdog
    try {
      const { logger } = await import('@/lib/activity-logger')
      logger.leeAction({
        action: enabled ? 'enable_autonomy' : 'disable_autonomy',
        incidentId: 'n/a',
        incidentTitle: `Category: ${category}`,
        cluster: 'ALL',
        editSummary: `Auto-send ${enabled ? 'ON' : 'OFF'} for ${category}`,
      }).catch(() => {})
    } catch { /* ignore */ }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
