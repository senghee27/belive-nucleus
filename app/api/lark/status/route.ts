import { NextResponse } from 'next/server'
import { getTokenStatus } from '@/lib/lark-tokens'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const status = await getTokenStatus()

    // Debug: check all tokens in DB
    const { data: allTokens } = await supabaseAdmin
      .from('lark_tokens')
      .select('token_type, is_active, expires_at, user_open_id, created_at')
      .order('created_at', { ascending: false })
      .limit(10)

    const tokenSummary = (allTokens ?? []).map(t => ({
      type: t.token_type,
      active: t.is_active,
      expires: t.expires_at,
      user: t.user_open_id ? (t.user_open_id as string).slice(0, 15) + '...' : null,
      created: t.created_at,
      expired: t.expires_at ? new Date(t.expires_at as string).getTime() < Date.now() : null,
    }))

    return NextResponse.json({ ok: true, ...status, debug_tokens: tokenSummary })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, connected: false, error: message })
  }
}
