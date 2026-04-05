const LARK_API_BASE = 'https://open.larksuite.com'

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
  try {
    const token = await getLarkToken()
    const res = await fetch(`${LARK_API_BASE}/open-apis/im/v1/messages?receive_id_type=${receiveIdType}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: message }) }),
    })
    const data = await res.json()
    if (data.code !== 0) { console.error('[lark:send]', `${data.code}: ${data.msg}`); return false }
    return true
  } catch (error) {
    console.error('[lark:send]', error instanceof Error ? error.message : 'Unknown')
    return false
  }
}
