import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { readGroupMessages, detectIssues } from '@/lib/lark-groups'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const groupIds = body.group_ids as string[]
    const prompt = body.prompt as string | undefined

    if (!groupIds || groupIds.length === 0) {
      return NextResponse.json({ error: 'group_ids required' }, { status: 400 })
    }

    const { data: groups } = await supabaseAdmin
      .from('monitored_groups')
      .select('*')
      .in('id', groupIds)

    let totalMessages = 0
    let totalIssues = 0

    for (const group of groups ?? []) {
      const messages = await readGroupMessages(group.cluster, group.chat_id)
      totalMessages += messages.length

      const context = prompt ? `${group.context ?? ''}\n${prompt}` : group.context ?? undefined
      const issues = await detectIssues(messages, group.cluster, context)
      totalIssues += issues.length
    }

    return NextResponse.json({
      ok: true,
      groups_scanned: (groups ?? []).length,
      messages_read: totalMessages,
      issues_found: totalIssues,
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
