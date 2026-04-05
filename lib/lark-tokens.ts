import { supabaseAdmin } from '@/lib/supabase-admin'

const LARK_API = 'https://open.larksuite.com'

// In-memory tenant token cache
let tenantTokenCache: { token: string; expiresAt: number } | null = null

export async function getLeeUserToken(): Promise<string> {
  // Check for active user token
  const { data: token } = await supabaseAdmin
    .from('lark_tokens')
    .select('*')
    .eq('token_type', 'user_access_token')
    .eq('is_active', true)
    .single()

  if (token) {
    const expiresAt = new Date(token.expires_at).getTime()
    const fiveMinBuffer = 5 * 60 * 1000

    if (Date.now() < expiresAt - fiveMinBuffer) {
      return token.token_value
    }
  }

  // Token expired or expiring soon — try refresh
  const { data: refreshRow } = await supabaseAdmin
    .from('lark_tokens')
    .select('*')
    .eq('token_type', 'refresh_token')
    .eq('is_active', true)
    .single()

  if (!refreshRow) {
    throw new Error('Lee user token expired. Visit /settings to reconnect.')
  }

  const refreshExpiresAt = new Date(refreshRow.expires_at).getTime()
  if (Date.now() >= refreshExpiresAt) {
    throw new Error('Lee refresh token expired. Visit /settings to reconnect.')
  }

  return refreshUserToken(refreshRow.token_value)
}

export async function refreshUserToken(refreshToken: string): Promise<string> {
  try {
    const tenantToken = await getTenantToken()

    const res = await fetch(`${LARK_API}/open-apis/authen/v1/oidc/refresh_access_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tenantToken}`,
      },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
    })

    const data = await res.json()

    if (data.code !== 0) {
      throw new Error(`Refresh failed: ${data.msg}`)
    }

    const tokenData = data.data
    const newAccessToken = tokenData.access_token
    const newRefreshToken = tokenData.refresh_token
    const expiresIn = tokenData.expires_in ?? 7200
    const refreshExpiresIn = tokenData.refresh_expires_in ?? 2592000

    // Deactivate old tokens
    await supabaseAdmin
      .from('lark_tokens')
      .update({ is_active: false })
      .in('token_type', ['user_access_token', 'refresh_token'])

    // Store new tokens
    await supabaseAdmin.from('lark_tokens').insert([
      {
        token_type: 'user_access_token',
        app_id: process.env.LARK_APP_ID!,
        token_value: newAccessToken,
        expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
        user_open_id: process.env.LEE_LARK_CHAT_ID,
        is_active: true,
      },
      {
        token_type: 'refresh_token',
        app_id: process.env.LARK_APP_ID!,
        token_value: newRefreshToken,
        expires_at: new Date(Date.now() + refreshExpiresIn * 1000).toISOString(),
        user_open_id: process.env.LEE_LARK_CHAT_ID,
        is_active: true,
      },
    ])

    console.log('[lark:refresh]', 'Tokens refreshed successfully')
    return newAccessToken
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:refresh]', message)
    throw new Error(`Token refresh failed: ${message}`)
  }
}

export async function getTenantToken(): Promise<string> {
  if (tenantTokenCache && Date.now() < tenantTokenCache.expiresAt) {
    return tenantTokenCache.token
  }

  try {
    const res = await fetch(`${LARK_API}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_id: process.env.LARK_APP_ID,
        app_secret: process.env.LARK_APP_SECRET,
      }),
    })

    const data = await res.json()

    if (!data.tenant_access_token) {
      throw new Error(`No token: ${JSON.stringify(data)}`)
    }

    tenantTokenCache = {
      token: data.tenant_access_token,
      expiresAt: Date.now() + (data.expire - 60) * 1000,
    }

    return tenantTokenCache.token
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:tenantToken]', message)
    throw new Error(`Tenant token failed: ${message}`)
  }
}

export async function getTokenStatus(): Promise<{
  connected: boolean
  expiresAt: Date | null
  needsRefresh: boolean
}> {
  const { data: token } = await supabaseAdmin
    .from('lark_tokens')
    .select('expires_at')
    .eq('token_type', 'user_access_token')
    .eq('is_active', true)
    .single()

  if (!token) {
    return { connected: false, expiresAt: null, needsRefresh: false }
  }

  const expiresAt = new Date(token.expires_at)
  const fiveMinBuffer = 5 * 60 * 1000
  const needsRefresh = Date.now() > expiresAt.getTime() - fiveMinBuffer

  return { connected: true, expiresAt, needsRefresh }
}
