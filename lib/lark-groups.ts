// sendGroupMessage — ONLY sends as Lee, NO bot fallback
import { getLeeUserToken } from '@/lib/lark-tokens'
import { getSafeChatId } from '@/lib/lark'

const LARK_API = 'https://open.larksuite.com'

export async function sendGroupMessage(chatId: string, content: string, _asLee = true): Promise<string | null> {
  const safeChatId = getSafeChatId(chatId, 'chat_id')

  try {
    const token = await getLeeUserToken()
    const res = await fetch(`${LARK_API}/open-apis/im/v1/messages?receive_id_type=chat_id`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ receive_id: safeChatId, msg_type: 'text', content: JSON.stringify({ text: content }) }),
    })
    const data = await res.json()
    if (data.code === 0) return data.data?.message_id ?? null
    console.error('[lark:sendGroup]', `Failed as Lee: ${data.code} ${data.msg}`)
    return null
  } catch (error) {
    console.error('[lark:sendGroup]', `Token error: ${error instanceof Error ? error.message : 'Unknown'}. Re-login needed.`)
    return null
  }
}

// Re-export scan from scanner.ts
export { scanEnabledGroups } from '@/lib/scanner'
