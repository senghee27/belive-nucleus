import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendGroupMessage } from '@/lib/lark-groups'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const content = body.content as string
    const chatId = body.chat_id as string

    if (!content?.trim()) {
      return NextResponse.json({ error: 'Content required' }, { status: 400 })
    }

    // Send to Lark group
    const msgId = await sendGroupMessage(chatId, content, true)
    const sent = msgId !== null

    // Insert timeline entry
    await supabaseAdmin.from('issue_timeline_entries').insert({
      issue_id: id,
      entry_type: 'lee_instruction',
      content,
      is_lee: true,
      sender_name: 'Lee Seng Hee',
      sender_open_id: process.env.LEE_LARK_CHAT_ID,
      metadata: { sent_to_chat_id: chatId },
    })

    // Update issue
    await supabaseAdmin
      .from('lark_issues')
      .update({ has_lee_replied: true })
      .eq('id', id)

    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
