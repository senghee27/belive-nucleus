import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendGroupMessage } from '@/lib/lark-groups'
import { createIncident } from '@/lib/incidents'

export async function POST(req: NextRequest, { params }: { params: Promise<{ cluster: string }> }) {
  try {
    const { cluster } = await params
    const { message, ticket_id, chat_id } = await req.json()
    if (!message || !chat_id) return NextResponse.json({ error: 'message and chat_id required' }, { status: 400 })

    const msgId = await sendGroupMessage(chat_id, message, true)

    // Create linked incident
    if (ticket_id) {
      await createIncident({
        source: 'manual', chat_id, cluster,
        agent: 'coo', problem_type: 'ops_maintenance',
        priority: 'P2', severity: 'YELLOW',
        title: `Follow-up: ${ticket_id}`,
        raw_content: message,
        sender_name: 'Lee Seng Hee',
      })
    }

    return NextResponse.json({ ok: true, sent: msgId !== null })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
