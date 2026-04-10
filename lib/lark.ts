const LARK_API_BASE = 'https://open.larksuite.com'

// ===== SAFETY GATE =====
// TEST_MODE OFF — Approve & Send goes to real groups.
// Test button has its own hardcoded test group chat_id.
const TEST_MODE = false
const TEST_CHAT_ID = 'oc_585301f0077f09015428801da0cba90d' // Nucleus Testing Group

// Lee's open_id is always allowed (DMs to Lee are safe)
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''

function getSafeChatId(chatId: string, receiveIdType: string): string {
  // Always allow DMs to Lee
  if (receiveIdType === 'open_id') return chatId
  if (chatId === LEE_OPEN_ID) return chatId

  // In test mode, redirect all group messages to test group
  if (TEST_MODE && chatId !== TEST_CHAT_ID) {
    console.log(`[lark:safety] Redirected ${chatId} → TEST GROUP`)
    return TEST_CHAT_ID
  }

  return chatId
}
// ===== END SAFETY GATE =====

let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function getLarkToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt) return cachedToken!

  try {
    const res = await fetch(`${LARK_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ app_id: process.env.LARK_APP_ID, app_secret: process.env.LARK_APP_SECRET }),
    })
    const data = await res.json()
    if (!data.tenant_access_token) throw new Error(`No token: ${JSON.stringify(data)}`)
    cachedToken = data.tenant_access_token as string
    tokenExpiresAt = now + (data.expire - 60) * 1000
    return cachedToken!
  } catch (error) {
    console.error('[lark:getToken]', error instanceof Error ? error.message : 'Unknown')
    throw error
  }
}

export async function sendLarkMessage(chatId: string, message: string, receiveIdType = 'chat_id'): Promise<boolean> {
  const safeChatId = getSafeChatId(chatId, receiveIdType)

  // ONLY send as Lee (user token) — NO bot fallback
  // If token expired, fail with clear error so user knows to re-login
  try {
    const { getLeeUserToken } = await import('./lark-tokens')
    const userToken = await getLeeUserToken()

    const res = await fetch(`${LARK_API_BASE}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${userToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive_id: safeChatId, msg_type: 'text', content: JSON.stringify({ text: message }) }),
    })
    const data = await res.json()
    if (data.code === 0) {
      console.log('[lark:send]', 'Sent as Lee')
      return true
    }
    console.error('[lark:send]', `Failed as Lee: ${data.code} ${data.msg}`)
    return false
  } catch (error) {
    console.error('[lark:send]', `Token error: ${error instanceof Error ? error.message : 'Unknown'}. Lee needs to re-login at /auth/login to refresh token.`)
    return false
  }
}

// Export for other modules that send cards directly
export { TEST_MODE, TEST_CHAT_ID, getSafeChatId }
