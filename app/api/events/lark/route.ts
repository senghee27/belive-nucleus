import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { classifyEvent } from '@/lib/agents/classify'
import { proposeDecision } from '@/lib/agents/propose'

async function processLarkEvent(body: Record<string, unknown>) {
  try {
    const event = body.event as Record<string, unknown> | undefined
    if (!event) return

    const message = event.message as Record<string, unknown> | undefined
    const sender = event.sender as Record<string, unknown> | undefined
    if (!message) return

    const message_id = message.message_id as string
    const chat_id = message.chat_id as string
    const chat_type = message.chat_type as string
    const rawContent = message.content as string

    // Parse content — Lark sends JSON string: {"text": "..."}
    let content: string
    try {
      const parsed = JSON.parse(rawContent)
      content = parsed.text ?? rawContent
    } catch {
      content = rawContent
    }

    if (!content || content.trim() === '') return

    // Extract sender info
    const senderId = sender?.sender_id as Record<string, unknown> | undefined
    const openId = senderId?.open_id as string | undefined

    // Deduplicate — check if message_id already exists
    const { data: existing } = await supabaseAdmin
      .from('events')
      .select('id')
      .eq('source_id', message_id)
      .single()

    if (existing) {
      console.log('[lark:dedup]', `Message ${message_id} already processed`)
      return
    }

    // Insert event
    const { data: eventRow, error: insertError } = await supabaseAdmin
      .from('events')
      .insert({
        source: 'lark',
        source_id: message_id,
        source_type: chat_type,
        sender_name: openId ?? null,
        sender_id: openId ?? null,
        chat_id: chat_id,
        content: content,
        raw_payload: body,
        processed: false,
      })
      .select()
      .single()

    if (insertError) throw new Error(insertError.message)

    console.log('[lark:event]', `Created event ${eventRow.id}`)

    // Classify
    const classification = await classifyEvent(content, 'lark')
    console.log('[lark:classify]', classification)

    // Propose
    const proposal = await proposeDecision(
      content,
      classification.agent,
      classification.problem_type,
      'lark'
    )
    console.log('[lark:propose]', proposal)

    // Insert decision
    const { error: decisionError } = await supabaseAdmin
      .from('decisions')
      .insert({
        event_id: eventRow.id,
        source: 'lark',
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

    console.log('[lark:complete]', `Event ${eventRow.id} fully processed`)
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:process]', msg)
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    // Log raw payload for debugging
    console.log('[lark:raw]', JSON.stringify(body).slice(0, 500))

    // Handle Lark challenge verification (v1 and v2 format)
    if (body.challenge) {
      return NextResponse.json({ challenge: body.challenge })
    }

    // Handle Lark v2 URL verification
    if (body.type === 'url_verification') {
      return NextResponse.json({ challenge: body.challenge ?? body.token })
    }

    // Use after() to process in background after response is sent
    after(async () => {
      await processLarkEvent(body)
    })

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:route]', message)
    return NextResponse.json({ ok: true })
  }
}
