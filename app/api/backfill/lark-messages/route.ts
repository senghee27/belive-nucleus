import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

// Parses the raw Lark message JSON the same way the webhook now does
function parseLarkContent(raw: string): string | null {
  if (!raw) return null
  // If it doesn't look like JSON, leave it alone
  if (!raw.trim().startsWith('{') && !raw.trim().startsWith('[')) return null

  try {
    const body = JSON.parse(raw)

    // Plain text message
    if (body.text) {
      return body.text.replace(/<[^>]*>/g, '').trim()
    }

    // Rich text post (Lark "post" msg_type)
    if (body.title || body.content) {
      const texts: string[] = []
      if (body.title) texts.push(body.title)
      const lines = body.content ?? []
      for (const line of lines) {
        if (Array.isArray(line)) {
          for (const elem of line) {
            if (elem?.text) texts.push(elem.text)
            else if (elem?.tag === 'a' && elem?.text) texts.push(elem.text)
            else if (elem?.tag === 'at' && elem?.user_name) texts.push(`@${elem.user_name}`)
          }
        }
      }
      return texts.join(' ').replace(/\s+/g, ' ').trim()
    }

    // Interactive card
    if (body.elements) {
      const texts: string[] = []
      for (const row of body.elements ?? []) {
        if (Array.isArray(row)) {
          for (const elem of row) if (elem?.text) texts.push(elem.text)
        } else if ((row as { text?: string })?.text) {
          texts.push((row as { text: string }).text)
        }
      }
      return texts.join('\n').trim()
    }

    return null
  } catch {
    return null
  }
}

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const dryRun = req.nextUrl.searchParams.get('dry_run') === '1'

    // Find messages whose content looks like raw Lark JSON
    const { data: messages, error } = await supabaseAdmin
      .from('lark_group_messages')
      .select('id, content')
      .or('content.like.{"title"%,content.like.{"text"%,content.like.{"content"%,content.like.{"elements"%')
      .limit(2000)

    if (error) throw new Error(error.message)

    const updates: { id: string; old: string; parsed: string }[] = []
    const skipped: { id: string; reason: string }[] = []

    for (const msg of messages ?? []) {
      const raw = msg.content as string
      const parsed = parseLarkContent(raw)
      if (parsed && parsed !== raw && parsed.length > 0) {
        updates.push({ id: msg.id as string, old: raw.slice(0, 60), parsed: parsed.slice(0, 60) })
      } else {
        skipped.push({ id: msg.id as string, reason: parsed === null ? 'unparseable' : 'no_change' })
      }
    }

    if (!dryRun) {
      // Apply updates in batches
      for (const u of updates) {
        await supabaseAdmin
          .from('lark_group_messages')
          .update({ content: parseLarkContent((messages ?? []).find(m => m.id === u.id)?.content as string) })
          .eq('id', u.id)
      }
    }

    // Also update incident raw_content for any incidents linked to these messages
    if (!dryRun && updates.length > 0) {
      const updatedIds = updates.map(u => u.id)
      const { data: incidents } = await supabaseAdmin
        .from('incidents')
        .select('id, raw_content, source_message_id')
        .in('source_message_id', updatedIds)

      for (const inc of incidents ?? []) {
        const parsed = parseLarkContent(inc.raw_content as string)
        if (parsed && parsed !== inc.raw_content) {
          await supabaseAdmin.from('incidents').update({ raw_content: parsed }).eq('id', inc.id)
        }
      }
    }

    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      total_scanned: messages?.length ?? 0,
      updated: updates.length,
      skipped: skipped.length,
      sample_updates: updates.slice(0, 5),
    })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
