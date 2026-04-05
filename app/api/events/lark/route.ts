import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createIncident, analyseIncident, classifyMessage } from '@/lib/incidents'

async function processLarkEvent(body: Record<string, unknown>) {
  try {
    const event = body.event as Record<string, unknown> | undefined
    if (!event) return
    const message = event.message as Record<string, unknown> | undefined
    if (!message) return

    const message_id = message.message_id as string
    const chat_id = message.chat_id as string
    const rawContent = message.content as string

    let content: string
    try { content = JSON.parse(rawContent).text ?? rawContent } catch { content = rawContent }
    if (!content?.trim()) return

    const sender = event.sender as Record<string, unknown> | undefined
    const senderId = sender?.sender_id as Record<string, unknown> | undefined

    const classification = await classifyMessage(content, 'lark_webhook')
    if (!classification.is_incident) return

    const incident = await createIncident({
      source: 'lark_webhook', source_message_id: message_id,
      chat_id, agent: classification.agent, problem_type: classification.problem_type,
      priority: classification.priority, severity: classification.severity,
      title: classification.title, raw_content: content,
      sender_name: senderId?.open_id as string ?? null,
      sender_open_id: senderId?.open_id as string ?? null,
    })

    if (incident) await analyseIncident(incident.id)
  } catch (error) {
    console.error('[lark:process]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    if (body.challenge) return NextResponse.json({ challenge: body.challenge })
    if (body.type === 'url_verification') return NextResponse.json({ challenge: body.challenge ?? body.token })

    after(async () => { await processLarkEvent(body) })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
