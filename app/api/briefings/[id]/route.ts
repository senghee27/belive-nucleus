import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

type Destination = {
  chat_id: string
  name: string
  type: string
  selected: boolean
  display_name?: string
  description?: string
  icon?: string
}

async function resolveDestinations(destinations: Destination[]): Promise<Destination[]> {
  const ouIds = destinations.filter(d => d.chat_id.startsWith('ou_')).map(d => d.chat_id)
  const ocIds = destinations.filter(d => d.chat_id.startsWith('oc_')).map(d => d.chat_id)

  const staffMap = new Map<string, string>()
  const groupMap = new Map<string, { name: string; type: string }>()

  if (ouIds.length > 0) {
    const { data } = await supabaseAdmin.from('staff_directory').select('open_id, name').in('open_id', ouIds)
    for (const s of data ?? []) staffMap.set(s.open_id, s.name)
  }
  if (ocIds.length > 0) {
    const { data } = await supabaseAdmin.from('monitored_groups').select('chat_id, group_name, group_type').in('chat_id', ocIds)
    for (const g of data ?? []) groupMap.set(g.chat_id, { name: g.group_name, type: g.group_type })
  }

  return destinations.map(d => {
    if (d.chat_id.startsWith('ou_')) {
      const staffName = staffMap.get(d.chat_id) ?? d.name
      return { ...d, display_name: staffName, description: 'Personal DM', icon: 'user' }
    }
    if (d.chat_id.startsWith('oc_')) {
      const group = groupMap.get(d.chat_id)
      const groupName = group?.name ?? d.name
      const groupType = group?.type ?? d.type
      const desc = groupType === 'cluster' ? 'Cluster group' : groupType === 'ai_report' ? 'AI Report group' : groupType === 'function' ? 'Function group' : 'Group chat'
      return { ...d, display_name: groupName, description: desc, icon: 'users' }
    }
    return { ...d, display_name: d.name, description: d.type, icon: 'users' }
  })
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { data, error } = await supabaseAdmin
      .from('briefing_reports')
      .select('*')
      .eq('id', id)
      .single()

    if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    // Resolve destination names
    const resolved = await resolveDestinations((data.destinations as Destination[]) ?? [])
    return NextResponse.json({ ok: true, report: { ...data, destinations: resolved } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const { content } = body

    if (!content) return NextResponse.json({ error: 'Missing content' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('briefing_reports')
      .update({ content, lee_edited: true })
      .eq('id', id)
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, report: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { error } = await supabaseAdmin
      .from('briefing_reports')
      .update({ status: 'discarded' })
      .eq('id', id)

    if (error) throw new Error(error.message)

    // Reset confidence on discard
    const { data: report } = await supabaseAdmin
      .from('briefing_reports')
      .select('report_type')
      .eq('id', id)
      .single()

    if (report) {
      const { resetConfidenceOnDiscard } = await import('@/lib/briefings/confidence')
      await resetConfidenceOnDiscard(report.report_type as string)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
