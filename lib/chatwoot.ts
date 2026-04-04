type ParsedChatwootPayload = {
  content: string
  conversation_id: number
  account_id: number
  sender_name: string
  sender_email: string | null
  event: string
  message_type: string
}

export async function sendChatwootReply(
  accountId: number,
  conversationId: number,
  message: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${process.env.CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          api_access_token: process.env.CHATWOOT_API_TOKEN!,
        },
        body: JSON.stringify({
          content: message,
          message_type: 'outgoing',
          private: false,
        }),
      }
    )

    if (!res.ok) {
      console.error('[chatwoot:sendReply]', `HTTP ${res.status}: ${await res.text()}`)
      return false
    }

    return true
  } catch (error) {
    const message_text = error instanceof Error ? error.message : 'Unknown error'
    console.error('[chatwoot:sendReply]', message_text)
    return false
  }
}

export function parseChatwootPayload(body: unknown): ParsedChatwootPayload | null {
  try {
    const payload = body as Record<string, unknown>

    if (!payload || typeof payload !== 'object') return null

    const event = payload.event as string | undefined
    const message_type = payload.message_type as string | undefined
    const content = payload.content as string | undefined
    const conversation = payload.conversation as Record<string, unknown> | undefined
    const account = payload.account as Record<string, unknown> | undefined
    const sender = payload.sender as Record<string, unknown> | undefined

    if (!event || !content || !conversation || !account) return null

    const conversation_id = conversation.id as number
    const account_id = account.id as number
    const sender_name = sender?.name as string ?? 'Unknown'
    const sender_email = (sender?.email as string) ?? null

    return {
      content,
      conversation_id,
      account_id,
      sender_name,
      sender_email,
      event,
      message_type: message_type ?? 'unknown',
    }
  } catch (error) {
    console.error('[chatwoot:parsePayload]', error instanceof Error ? error.message : 'Parse failed')
    return null
  }
}
