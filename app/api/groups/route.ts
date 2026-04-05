import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('monitored_groups')
      .select('*')
      .order('cluster', { ascending: true })

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, groups: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    if (!body.chat_id || !body.group_name || !body.cluster) {
      return NextResponse.json({ error: 'chat_id, group_name, and cluster are required' }, { status: 400 })
    }

    // Check duplicate
    const { data: existing } = await supabaseAdmin
      .from('monitored_groups')
      .select('id')
      .eq('chat_id', body.chat_id)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Group with this chat_id already exists' }, { status: 409 })
    }

    const { data, error } = await supabaseAdmin
      .from('monitored_groups')
      .insert({
        chat_id: body.chat_id,
        group_name: body.group_name,
        cluster: body.cluster,
        cluster_color: body.cluster_color ?? '#F2784B',
        location: body.location,
        group_type: body.group_type ?? 'cluster',
        context: body.context,
        agent: body.agent ?? 'coo',
      })
      .select()
      .single()

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, group: data })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
