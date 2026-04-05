import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')

    if (!code) {
      return NextResponse.redirect(new URL('/settings?error=no_code', req.url))
    }

    const appId = process.env.LARK_APP_ID!
    const appSecret = process.env.LARK_APP_SECRET!

    // First get a tenant_access_token for the API call
    const tenantRes = await fetch(
      'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
      }
    )
    const tenantData = await tenantRes.json()
    const tenantToken = tenantData.tenant_access_token

    if (!tenantToken) {
      console.error('[lark:oauth]', 'Failed to get tenant token', tenantData)
      return NextResponse.redirect(new URL('/settings?error=tenant_token_failed', req.url))
    }

    // Exchange code for user tokens using tenant token
    const res = await fetch(
      'https://open.larksuite.com/open-apis/authen/v1/oidc/access_token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${tenantToken}`,
        },
        body: JSON.stringify({
          grant_type: 'authorization_code',
          code,
        }),
      }
    )

    const data = await res.json()
    console.log('[lark:oauth]', JSON.stringify(data).slice(0, 500))

    if (data.code !== 0) {
      console.error('[lark:oauth]', `Error ${data.code}: ${data.msg}`)
      return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(data.msg || 'oauth_failed')}`, req.url))
    }

    const tokenData = data.data
    const accessToken = tokenData.access_token
    const refreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in ?? 7200
    const refreshExpiresIn = tokenData.refresh_expires_in ?? 2592000

    // Deactivate existing user tokens
    await supabaseAdmin
      .from('lark_tokens')
      .update({ is_active: false })
      .eq('token_type', 'user_access_token')

    await supabaseAdmin
      .from('lark_tokens')
      .update({ is_active: false })
      .eq('token_type', 'refresh_token')

    // Store user_access_token
    await supabaseAdmin.from('lark_tokens').insert({
      token_type: 'user_access_token',
      app_id: appId,
      token_value: accessToken,
      expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      user_open_id: process.env.LEE_LARK_CHAT_ID,
      is_active: true,
    })

    // Store refresh_token
    await supabaseAdmin.from('lark_tokens').insert({
      token_type: 'refresh_token',
      app_id: appId,
      token_value: refreshToken,
      expires_at: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
      user_open_id: process.env.LEE_LARK_CHAT_ID,
      is_active: true,
    })

    console.log('[lark:oauth]', 'Tokens saved successfully')
    return NextResponse.redirect(new URL('/settings?success=true', req.url))
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:oauth:error]', message)
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(message)}`, req.url))
  }
}
