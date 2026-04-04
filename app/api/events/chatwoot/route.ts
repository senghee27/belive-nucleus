import { NextRequest, NextResponse, after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { parseChatwootPayload } from '@/lib/chatwoot'
import { classifyEvent } from '@/lib/agents/classify'
import { proposeDecision } from '@/lib/agents/propose'

async function processChatwootEvent(body: unknown) {
  try {
    const payload = parseChatwootPayload(body)
    if (!payload) {
      console.log('[chatwoot:parse]', 'Invalid payload, skipping')
      return
    }

    // Only process incoming messages
    if (payload.event !== 'message_created') return
    if (payload.message_type !== 'incoming') return

    const sourceId = `chatwoot_${payload.conversation_id}_${Date.now()}`

    // Insert event
    const { data: eventRow, error: insertError } = await supabaseAdmin
      .from('events')
      .insert({
        source: 'chatwoot',
        source_id: sourceId,
        source_type: 'conversation',
        sender_name: payload.sender_name,
        sender_id: payload.sender_email,
        chat_id: String(payload.conversation_id),
        chat_name: `Account ${payload.account_id}`,
        content: payload.content,
        raw_payload: body as Record<string, unknown>,
        processed: false,
      })
      .select()
      .single()

    if (insertError) throw new Error(insertError.message)

    console.log('[chatwoot:event]', `Created event ${eventRow.id}`)

    // Classify
    const classification = await classifyEvent(payload.content, 'chatwoot')
    console.log('[chatwoot:classify]', classification)

    // Propose
    const proposal = await proposeDecision(
      payload.content,
      classification.agent,
      classification.problem_type,
      'chatwoot'
    )
    console.log('[chatwoot:propose]', proposal)

    // Insert decision
    const { error: decisionError } = await supabaseAdmin
      .from('decisions')
      .insert({
        event_id: eventRow.id,
        source: 'chatwoot',
        agent: classification.agent,
        problem_type: classification.problem_type,
        priority: classification.priority,
        ai_summary: classification.summary,
        ai_proposal: proposal.proposal,
        ai_reasoning: proposal.reasoning,
        ai_confidence: proposal.confidence,
        status: 'pending',
      })

    if (decisionError) throw new Error(decisionError.message)

    // Mark event as processed
    await supabaseAdmin
      .from('events')
      .update({ processed: true })
      .eq('id', eventRow.id)

    console.log('[chatwoot:complete]', `Event ${eventRow.id} fully processed`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[chatwoot:process]', msg)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Use after() to process in background after response is sent
    after(async () => {
      await processChatwootEvent(body)
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[chatwoot:route]', message)
    return NextResponse.json({ ok: true })
  }
}
