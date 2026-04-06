import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const OU_PATTERN = /ou_[a-f0-9]+/g

async function buildStaffMap(events: Record<string, unknown>[]): Promise<Map<string, string>> {
  const ouIds = new Set<string>()
  for (const e of events) {
    for (const m of ((e.summary as string) ?? '').match(OU_PATTERN) ?? []) ouIds.add(m)
    for (const m of (e.detail ? JSON.stringify(e.detail) : '').match(OU_PATTERN) ?? []) ouIds.add(m)
  }
  if (ouIds.size === 0) return new Map()
  const { data } = await supabaseAdmin.from('staff_directory').select('open_id, name').in('open_id', [...ouIds])
  const map = new Map<string, string>()
  for (const s of data ?? []) map.set(s.open_id, s.name)
  return map
}

function resolveText(text: string, m: Map<string, string>): string {
  let r = text
  for (const [id, name] of m) { if (r.includes(id)) r = r.replaceAll(id, name) }
  return r
}

function resolveDetail(detail: Record<string, unknown> | null, m: Map<string, string>): Record<string, unknown> | null {
  if (!detail) return null
  const res: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(detail)) {
    res[k] = typeof v === 'string' ? resolveText(v, m) : v
  }
  return res
}

export async function GET(req: NextRequest) {
  try {
    const eventType = req.nextUrl.searchParams.get('event_type')
    const cluster = req.nextUrl.searchParams.get('cluster')
    const limit = parseInt(req.nextUrl.searchParams.get('limit') ?? '100')

    let query = supabaseAdmin.from('nucleus_activity_log').select('*').order('created_at', { ascending: false }).limit(Math.min(limit, 500))
    if (eventType) query = query.eq('event_type', eventType)
    if (cluster) query = query.eq('cluster', cluster)

    const { data: rawEvents } = await query
    const events = rawEvents ?? []

    // Resolve ou_ IDs to real staff names
    const staffMap = await buildStaffMap(events)
    const resolved = events.map(e => ({
      ...e,
      summary: resolveText((e.summary as string) ?? '', staffMap),
      detail: resolveDetail(e.detail as Record<string, unknown> | null, staffMap),
    }))

    // Stats
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const { data: todayEvents } = await supabaseAdmin.from('nucleus_activity_log').select('event_type, success').gte('created_at', today.toISOString())
    const byType: Record<string, number> = {}
    let errorsToday = 0
    for (const e of todayEvents ?? []) {
      byType[e.event_type] = (byType[e.event_type] ?? 0) + 1
      if (e.event_type === 'ERROR') errorsToday++
    }

    return NextResponse.json({
      ok: true,
      events: resolved,
      stats: { total: (todayEvents ?? []).length, by_type: byType, errors_today: errorsToday },
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
