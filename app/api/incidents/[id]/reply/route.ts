import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { detectMentionsInText, buildMentionTag } from '@/lib/staff-directory'
import { getLeeUserToken } from '@/lib/lark-tokens'
import { getLarkToken, getSafeChatId } from '@/lib/lark'

type SendMode = 'thread' | 'message'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const body = await req.json()
    let content = (body.content as string) ?? ''
    const useProposed = body.use_proposed as boolean
    const mode = body.mode as SendMode | undefined

    if (mode !== 'thread' && mode !== 'message') {
      return NextResponse.json(
        { error: 'Missing or invalid "mode" — must be "thread" or "message"' },
        { status: 400 }
      )
    }

    const { data: incident } = await supabaseAdmin
      .from('incidents')
      .select('chat_id, cluster, ai_proposal, source_message_id, lark_root_id')
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

    // Get user token (send as Lee ONLY — no bot fallback)
    let token: string
    try {
      token = await getLeeUserToken()
    } catch (error) {
      return NextResponse.json({
        error: 'Lee\'s Lark token expired. Please re-login at /auth/login to refresh.',
        token_expired: true,
      }, { status: 401 })
    }

    const safeChatId = getSafeChatId(incident.chat_id, 'chat_id')

    // Thread-reply root: prefer Lark's explicit root_id (set when this
    // incident was born from a reply into an existing thread), else
    // fall back to source_message_id (the triggering top-level message,
    // which becomes the root of a new thread when Lee replies).
    const threadRootId: string | null =
      (incident.lark_root_id as string | null) ??
      (incident.source_message_id as string | null) ??
      null

    // Branch on explicit mode — Lark uses two different endpoints for
    // thread replies vs top-level messages, and the previous attempt
    // (reply_in_thread flag on the create endpoint) was a no-op.
    //
    //   thread  → POST /im/v1/messages/{message_id}/reply
    //   message → POST /im/v1/messages?receive_id_type=chat_id
    //
    // Thread mode requires an anchor message_id. Reject with 400 if
    // neither lark_root_id nor source_message_id is populated.
    let url: string
    let payload: Record<string, unknown>

    if (mode === 'thread') {
      if (!threadRootId) {
        return NextResponse.json(
          { error: 'No thread anchor on this incident — cannot reply in thread' },
          { status: 400 }
        )
      }
      url = `https://open.larksuite.com/open-apis/im/v1/messages/${threadRootId}/reply`
      payload = {
        msg_type: 'text',
        content: JSON.stringify({ text: larkContent }),
        reply_in_thread: true,
      }
    } else {
      url = `https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id`
      payload = {
        receive_id: safeChatId,
        msg_type: 'text',
        content: JSON.stringify({ text: larkContent }),
      }
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const resData = await res.json()
    const sent = resData.code === 0

    if (!sent) {
      console.error('[api:reply]', `mode=${mode} Lark error code=${resData.code} msg=${resData.msg}`)
    }

    // Add timeline entry
    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: id,
      entry_type: 'lee_instruction',
      content: content, // original text, not lark-formatted
      is_lee: true,
      sender_name: 'Lee Seng Hee',
      metadata: {
        mode,
        sent_as_thread_reply: mode === 'thread',
        root_id: mode === 'thread' ? threadRootId : null,
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
      mode,
      mentions: mentions.map(m => m.name),
      lark_error: sent ? undefined : `code=${resData.code} msg=${resData.msg}`,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
