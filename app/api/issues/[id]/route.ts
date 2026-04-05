import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { resolveIssue, escalateIssue, sendFollowUpToGroup } from '@/lib/issues'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    if (body.status === 'resolved') {
      await resolveIssue(id, body.resolved_by ?? 'Lee')
      return NextResponse.json({ ok: true, status: 'resolved' })
    }

    if (body.action === 'escalate') {
      await escalateIssue(id)
      return NextResponse.json({ ok: true, action: 'escalated' })
    }

    if (body.action === 'follow_up' && body.message) {
      const sent = await sendFollowUpToGroup(id, body.message)
      return NextResponse.json({ ok: true, sent })
    }

    // Generic update
    const updates: Record<string, unknown> = {}
    if (body.severity) updates.severity = body.severity
    if (body.owner_name) updates.owner_name = body.owner_name
    if (body.notes !== undefined) updates.notes = body.notes

    if (Object.keys(updates).length > 0) {
      await supabaseAdmin.from('lark_issues').update(updates).eq('id', id)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
