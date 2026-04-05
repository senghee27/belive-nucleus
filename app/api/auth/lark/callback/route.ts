import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createSessionJWT, isAllowedUser } from '@/lib/auth'
import type { NucleusSession } from '@/lib/types'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://belive-nucleus.vercel.app'

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get('code')
    const redirectPath = req.nextUrl.searchParams.get('redirect') ?? '/'

    if (!code) {
      return NextResponse.redirect(`${APP_URL}/auth/login?error=no_code`)
    }

    const appId = process.env.LARK_APP_ID!
    const appSecret = process.env.LARK_APP_SECRET!

    // Get tenant token first (Lark requires it for OIDC)
    const tenantRes = await fetch('https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
    })
    const tenantData = await tenantRes.json()
    const tenantToken = tenantData.tenant_access_token

    if (!tenantToken) {
      console.error('[auth:callback]', 'Failed to get tenant token')
      return NextResponse.redirect(`${APP_URL}/auth/login?error=token_failed`)
    }

    // Exchange code for user tokens
    const tokenRes = await fetch('https://open.larksuite.com/open-apis/authen/v1/oidc/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tenantToken}` },
      body: JSON.stringify({ grant_type: 'authorization_code', code }),
    })

    const tokenData = await tokenRes.json()
    console.log('[auth:callback]', JSON.stringify(tokenData).slice(0, 300))

    if (tokenData.code !== 0 || !tokenData.data?.access_token) {
      console.error('[auth:callback]', `Error: ${tokenData.msg ?? 'no access token'}`)
      return NextResponse.redirect(`${APP_URL}/auth/login?error=token_failed`)
    }

    const { access_token, refresh_token, expires_in, open_id, name } = tokenData.data

    // Check if user is allowed
    // Use open_id from token response, or get from user info
    let userOpenId = open_id
    if (!userOpenId) {
      const userInfoRes = await fetch('https://open.larksuite.com/open-apis/authen/v1/user_info', {
        headers: { Authorization: `Bearer ${access_token}` },
      })
      const userInfo = await userInfoRes.json()
      userOpenId = userInfo.data?.open_id
    }

    const { allowed, user } = isAllowedUser(userOpenId)
    if (!allowed) {
      console.log('[auth:callback]', `Denied: ${userOpenId} (${name})`)
      return NextResponse.redirect(`${APP_URL}/auth/denied`)
    }

    // Store tokens in lark_tokens table
    // Deactivate old tokens first
    await supabaseAdmin.from('lark_tokens').update({ is_active: false })
      .eq('token_type', 'user_access_token').eq('user_open_id', userOpenId)
    await supabaseAdmin.from('lark_tokens').update({ is_active: false })
      .eq('token_type', 'refresh_token').eq('user_open_id', userOpenId)

    await supabaseAdmin.from('lark_tokens').insert({
      token_type: 'user_access_token', app_id: appId,
      token_value: access_token,
      expires_at: new Date(Date.now() + (expires_in ?? 7200) * 1000).toISOString(),
      user_open_id: userOpenId, is_active: true,
    })

    if (refresh_token) {
      await supabaseAdmin.from('lark_tokens').insert({
        token_type: 'refresh_token', app_id: appId,
        token_value: refresh_token,
        expires_at: new Date(Date.now() + 30 * 24 * 3600000).toISOString(),
        user_open_id: userOpenId, is_active: true,
      })
    }

    // Create JWT session
    const session: NucleusSession = {
      open_id: userOpenId,
      name: user!.name,
      role: user!.role,
      lark_access_token: access_token,
      lark_token_expires_at: Date.now() + (expires_in ?? 7200) * 1000,
      session_expires_at: Date.now() + 7 * 24 * 3600000,
      issued_at: Date.now(),
    }

    const jwt = await createSessionJWT(session)

    // Redirect with session cookie
    const response = NextResponse.redirect(`${APP_URL}${redirectPath}`)
    response.cookies.set('nucleus_session', jwt, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7 * 24 * 3600,
    })

    console.log('[auth:callback]', `Logged in: ${user!.name} (${userOpenId})`)
    return response
  } catch (error) {
    console.error('[auth:callback]', error instanceof Error ? error.message : 'Unknown')
    return NextResponse.redirect(`${APP_URL}/auth/login?error=unknown`)
  }
}
