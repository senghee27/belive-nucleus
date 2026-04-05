import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveIncident } from '@/lib/incidents'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { data: incident } = await supabaseAdmin.from('incidents').select('*').eq('id', id).single()
    const { data: timeline } = await supabaseAdmin.from('incident_timeline').select('*').eq('incident_id', id).order('created_at', { ascending: true })
    return NextResponse.json({ ok: true, incident, timeline: timeline ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()

    if (body.status === 'resolved') {
      await resolveIncident(id, body.resolved_by ?? 'Lee', body.resolution_note)
      return NextResponse.json({ ok: true })
    }

    const allowed = ['severity', 'priority', 'tags', 'resolution_note', 'status']
    const updates: Record<string, unknown> = {}
    for (const key of allowed) if (body[key] !== undefined) updates[key] = body[key]
    if (Object.keys(updates).length > 0) {
      updates.status_changed_at = new Date().toISOString()
      await supabaseAdmin.from('incidents').update(updates).eq('id', id)
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
