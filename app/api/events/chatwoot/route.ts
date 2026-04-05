import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createIncident, analyseIncident, classifyMessage } from '@/lib/incidents'
import { parseChatwootPayload } from '@/lib/chatwoot'

async function processChatwootEvent(body: unknown) {
  try {
    const payload = parseChatwootPayload(body)
    if (!payload || payload.event !== 'message_created' || payload.message_type !== 'incoming') return

    const classification = await classifyMessage(payload.content, 'chatwoot')
    if (!classification.is_incident) return

    const incident = await createIncident({
      source: 'chatwoot', source_message_id: `chatwoot_${payload.conversation_id}_${Date.now()}`,
      chat_id: String(payload.conversation_id),
      agent: classification.agent, problem_type: classification.problem_type,
      priority: classification.priority, severity: classification.severity,
      title: classification.title, raw_content: payload.content,
      sender_name: payload.sender_name,
    })

    if (incident) await analyseIncident(incident.id)
  } catch (error) {
    console.error('[chatwoot:process]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    after(async () => { await processChatwootEvent(body) })
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
