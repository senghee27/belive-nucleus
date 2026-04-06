import { NextRequest, NextResponse } from 'next/server'
import { getIncidents, getIncidentStats, createIncident, analyseIncident, classifyMessage } from '@/lib/incidents'
import { supabaseAdmin } from '@/lib/supabase-admin'

const OU_PATTERN = /^ou_[a-f0-9]+$/

async function resolveStaffNames(incidents: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  // Collect all ou_ IDs used as sender_name
  const ouIds = new Set<string>()
  for (const inc of incidents) {
    const name = inc.sender_name as string | null
    if (name && OU_PATTERN.test(name)) ouIds.add(name)
  }
  if (ouIds.size === 0) return incidents

  const { data } = await supabaseAdmin.from('staff_directory').select('open_id, name').in('open_id', [...ouIds])
  const map = new Map<string, string>()
  for (const s of data ?? []) map.set(s.open_id, s.name)

  return incidents.map(inc => {
    const name = inc.sender_name as string | null
    if (name && map.has(name)) return { ...inc, sender_name: map.get(name) }
    return inc
  })
}

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')
    const cluster = req.nextUrl.searchParams.get('cluster')
    const severity = req.nextUrl.searchParams.get('severity')
    const limit = req.nextUrl.searchParams.get('limit')

    const filters: Record<string, unknown> = {}
    if (status) filters.status = status.includes(',') ? status.split(',') : status
    if (cluster) filters.cluster = cluster
    if (severity) filters.severity = severity
    if (limit) filters.limit = parseInt(limit)

    const [rawIncidents, stats] = await Promise.all([getIncidents(filters), getIncidentStats()])
    const incidents = await resolveStaffNames(rawIncidents as Record<string, unknown>[])
    return NextResponse.json({ ok: true, incidents, stats })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (!body.raw_content) return NextResponse.json({ error: 'raw_content required' }, { status: 400 })

    const classification = await classifyMessage(body.raw_content, body.source ?? 'manual')
    if (!classification.is_incident) return NextResponse.json({ ok: true, is_incident: false })

    const incident = await createIncident({
      source: body.source ?? 'manual', raw_content: body.raw_content,
      chat_id: body.chat_id, cluster: body.cluster,
      agent: classification.agent, problem_type: classification.problem_type,
      priority: classification.priority, severity: classification.severity,
      title: classification.title, sender_name: body.sender_name,
    })

    if (incident) await analyseIncident(incident.id)
    return NextResponse.json({ ok: true, incident })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
