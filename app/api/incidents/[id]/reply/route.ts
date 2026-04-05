import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { detectMentionsInText, buildMentionTag } from '@/lib/staff-directory'
import { getLeeUserToken } from '@/lib/lark-tokens'
import { getLarkToken, getSafeChatId } from '@/lib/lark'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    let content = (body.content as string) ?? ''
    const useProposed = body.use_proposed as boolean

    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('chat_id, cluster, ai_proposal, source_lark_message_id')
      .eq('id', id)
      .single()

    if (!incident?.chat_id) return NextResponse.json({ error: 'No chat_id' }, { status: 400 })

    if (useProposed) content = incident.ai_proposal ?? ''
    if (!content.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

    // Detect @mentions — collect open_ids for Lark at_user_ids
    const mentions = await detectMentionsInText(content)
    const mentionOpenIds = mentions.map(m => m.openId)

    // Build Lark message content with <at> tags inline
    let larkContent = content
    for (const m of mentions) {
      const firstName = m.name.split(' ')[0]
      const nameRegex = new RegExp(`\\b${firstName}\\b`, 'i')
      larkContent = larkContent.replace(nameRegex, `<at user_id="${m.openId}">${firstName}</at>`)
    }

    // Get user token (send as Lee)
    let token: string
    try {
      token = await getLeeUserToken()
    } catch {
      token = await getLarkToken()
    }

    const safeChatId = getSafeChatId(incident.chat_id, 'chat_id')

    // Build message payload — thread reply if root_id available
    const payload: Record<string, unknown> = {
      receive_id: safeChatId,
      msg_type: 'text',
      content: JSON.stringify({ text: larkContent }),
    }

    // Reply in thread if source message exists
    if (incident.source_lark_message_id) {
      payload.reply_in_thread = true
      payload.root_id = incident.source_lark_message_id
    }

    const res = await fetch(
      `https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    )

    const resData = await res.json()
    const sent = resData.code === 0

    // Add timeline entry
    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: id,
      entry_type: 'lee_instruction',
      content: content, // original text, not lark-formatted
      is_lee: true,
      sender_name: 'Lee Seng Hee',
      metadata: {
        sent_as_thread_reply: !!incident.source_lark_message_id,
        root_id: incident.source_lark_message_id,
        mentions: mentions.map(m => m.name),
        lark_message_id: resData.data?.message_id,
      },
    })

    // Update incident
    await supabaseAdmin.from('incidents').update({ has_lee_replied: true }).eq('id', id)

    // If using proposed action, update status
    if (useProposed) {
      await supabaseAdmin.from('incidents').update({
        lee_action: 'approved',
        lee_instruction: content,
        lee_decided_at: new Date().toISOString(),
        status: 'acting',
        status_changed_at: new Date().toISOString(),
        sent_at: sent ? new Date().toISOString() : null,
      }).eq('id', id)
    }

    return NextResponse.json({
      ok: true,
      sent,
      message_id: resData.data?.message_id,
      thread_reply: !!incident.source_lark_message_id,
      mentions: mentions.map(m => m.name),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
