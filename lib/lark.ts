const LARK_API_BASE = 'https://open.larksuite.com'

let cachedToken: string | null = null
let tokenExpiresAt = 0

export async function getLarkToken(): Promise<string> {
  const now = Date.now()
  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken
  }

  try {
    const res = await fetch(
      `${LARK_API_BASE}/open-apis/auth/v3/tenant_access_token/internal`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          app_id: process.env.LARK_APP_ID,
          app_secret: process.env.LARK_APP_SECRET,
        }),
      }
    )

    const data = await res.json()

    if (!data.tenant_access_token) {
      throw new Error(`Lark token response missing token: ${JSON.stringify(data)}`)
    }

    cachedToken = data.tenant_access_token as string
    // Cache with 60 second buffer before actual expiry (7200s)
    tokenExpiresAt = now + (data.expire - 60) * 1000

    return cachedToken!
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:getToken]', message)
    throw new Error(`Failed to get Lark token: ${message}`)
  }
}

export async function sendLarkMessage(
  chat_id: string,
  message: string,
  receive_id_type: string = 'chat_id'
): Promise<boolean> {
  try {
    const token = await getLarkToken()

    const res = await fetch(
      `${LARK_API_BASE}/open-apis/im/v1/messages?receive_id_type=${receive_id_type}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          receive_id: chat_id,
          msg_type: 'text',
          content: JSON.stringify({ text: message }),
        }),
      }
    )

    const data = await res.json()

    if (data.code !== 0) {
      console.error('[lark:sendMessage]', `Code ${data.code}: ${data.msg}`)
      return false
    }

    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[lark:sendMessage]', message)
    return false
  }
}

export function formatApprovalMessage(
  decision_id: string,
  problem: string,
  suggestion: string,
  confidence: number,
  reasoning: string
): string {
  return [
    `📋 Decision Needed`,
    ``,
    `Problem: ${problem}`,
    ``,
    `Suggested Action:`,
    suggestion,
    ``,
    `Reasoning: ${reasoning}`,
    ``,
    `Confidence: ${confidence}%`,
    ``,
    `Decision ID: ${decision_id}`,
    `Reply with: approve / edit / reject`,
  ].join('\n')
}
