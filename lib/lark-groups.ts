// Legacy compatibility — sendGroupMessage used by briefings and reply routes
import { getTenantToken, getLeeUserToken } from '@/lib/lark-tokens'
import { getSafeChatId } from '@/lib/lark'

const LARK_API = 'https://open.larksuite.com'

export async function sendGroupMessage(chatId: string, content: string, asLee = true): Promise<string | null> {
  const safeChatId = getSafeChatId(chatId, 'chat_id')
  const tokens: string[] = []

  if (asLee) {
    try { tokens.push(await getLeeUserToken()) } catch { /* fallback */ }
  }
  try { tokens.push(await getTenantToken()) } catch { /* no token */ }

  for (const token of tokens) {
    try {
      const res = await fetch(`${LARK_API}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ receive_id: safeChatId, msg_type: 'text', content: JSON.stringify({ text: content }) }),
      })
      const data = await res.json()
      if (data.code === 0) return data.data?.message_id ?? null
    } catch { /* try next */ }
  }
  return null
}

// Re-export scan from scanner.ts
export { scanEnabledGroups } from '@/lib/scanner'
