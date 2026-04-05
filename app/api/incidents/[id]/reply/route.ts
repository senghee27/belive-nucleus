import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendGroupMessage } from '@/lib/lark-groups'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const { content } = await req.json()
    if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

    const { data: incident } = await supabaseAdmin.from('incidents').select('chat_id, cluster').eq('id', id).single()
    if (!incident?.chat_id) return NextResponse.json({ error: 'No chat_id' }, { status: 400 })

    const msgId = await sendGroupMessage(incident.chat_id, content, true)

    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: id, entry_type: 'lee_instruction', content,
      is_lee: true, sender_name: 'Lee Seng Hee',
    })

    await supabaseAdmin.from('incidents').update({ has_lee_replied: true }).eq('id', id)

    return NextResponse.json({ ok: true, sent: msgId !== null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
