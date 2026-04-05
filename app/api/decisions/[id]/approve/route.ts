import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendLarkMessage } from '@/lib/lark'
import { sendChatwootReply } from '@/lib/chatwoot'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const action = body.action as 'approve' | 'edit' | 'reject'
    const lee_edit = body.lee_edit as string | undefined

    if (!action || !['approve', 'edit', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action. Must be approve, edit, or reject.' },
        { status: 400 }
      )
    }

    // Fetch decision + event
    const { data: decision, error: fetchError } = await supabaseAdmin
      .from('decisions')
      .select('*, events(*)')
      .eq('id', id)
      .single()

    if (fetchError) {
      console.error('[approve:fetch]', fetchError.message)
      return NextResponse.json({ error: 'Decision not found' }, { status: 404 })
    }

    // Determine final reply
    let final_reply: string | null = null
    let status: string = action

    if (action === 'approve') {
      final_reply = decision.ai_proposal
      status = 'approved'
    } else if (action === 'edit') {
      if (!lee_edit) {
        return NextResponse.json(
          { error: 'lee_edit is required for edit action' },
          { status: 400 }
        )
      }
      final_reply = lee_edit
      status = 'edited'
    } else {
      // reject — no message sent
      final_reply = null
      status = 'rejected'
    }

    // Send message if there's a reply
    let sent = false
    if (final_reply && decision.events) {
      const event = decision.events
      if (decision.source === 'lark' && event.chat_id) {
        sent = await sendLarkMessage(event.chat_id, final_reply)
      } else if (decision.source === 'chatwoot' && event.chat_id) {
        const conversationId = parseInt(event.chat_id, 10)
        // Extract account_id from raw_payload
        const rawPayload = event.raw_payload as Record<string, unknown> | null
        const account = rawPayload?.account as Record<string, unknown> | undefined
        const accountId = (account?.id as number) ?? 1
        sent = await sendChatwootReply(accountId, conversationId, final_reply)
      }

      if (!sent && final_reply) {
        console.warn('[approve:send]', `Failed to send reply via ${decision.source} — saving to DB anyway`)
      }
    }

    // Update decision
    const { error: updateError } = await supabaseAdmin
      .from('decisions')
      .update({
        status,
        lee_edit: lee_edit ?? null,
        final_reply,
        sent_at: final_reply ? new Date().toISOString() : null,
      })
      .eq('id', id)

    if (updateError) {
      console.error('[approve:update]', updateError.message)
      return NextResponse.json({ error: 'Failed to update decision' }, { status: 500 })
    }

    // Update agent_memory
    const isApproved = action === 'approve' || action === 'edit'

    const { data: memory } = await supabaseAdmin
      .from('agent_memory')
      .select('*')
      .eq('agent', decision.agent)
      .eq('problem_type', decision.problem_type)
      .single()

    if (memory) {
      const newTotal = memory.total_decisions + 1
      const newApproved = memory.approved_count + (isApproved ? 1 : 0)
      const newRate = Math.round((newApproved / newTotal) * 100)
      const autonomous = newRate >= 95 && newTotal >= 10

      await supabaseAdmin
        .from('agent_memory')
        .update({
          total_decisions: newTotal,
          approved_count: newApproved,
          approval_rate: newRate,
          autonomous,
        })
        .eq('id', memory.id)

      console.log('[approve:memory]', `${decision.agent}/${decision.problem_type}: ${newApproved}/${newTotal} = ${newRate}%`)
    }

    // BUG 4 FIX: Sync linked issue
    if (decision.lark_issue_id) {
      if (status === 'rejected') {
        await supabaseAdmin
          .from('lark_issues')
          .update({ notes: 'Lee overrode this issue classification' })
          .eq('id', decision.lark_issue_id)
      }
      // If approved and reply sent, add note to issue
      if (isApproved && final_reply) {
        await supabaseAdmin
          .from('lark_issues')
          .update({ notes: `Lee approved action: ${final_reply.slice(0, 200)}` })
          .eq('id', decision.lark_issue_id)
      }
    }

    return NextResponse.json({ ok: true, status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[approve:route]', message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
