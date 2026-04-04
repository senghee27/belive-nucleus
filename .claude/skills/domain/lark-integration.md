# Skill: Lark Integration

## API Base
International: https://open.larksuite.com

## Auth — Get Bot Token
```typescript
const res = await fetch(
  'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
  {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: process.env.LARK_APP_ID,
      app_secret: process.env.LARK_APP_SECRET
    })
  }
)
const { tenant_access_token, expire } = await res.json()
```

## Send Message
```typescript
await fetch(
  'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=open_id',
  {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      receive_id: open_id,
      msg_type: 'text',
      content: JSON.stringify({ text: message })
    })
  }
)
```

## Webhook Payload Structure
```typescript
type LarkWebhookPayload = {
  challenge?: string  // verification handshake
  event?: {
    message: {
      message_id: string
      chat_id: string
      chat_type: 'p2p' | 'group'
      content: string  // JSON string: {"text": "..."}
    }
    sender: {
      sender_id: {
        open_id: string
        user_id: string
      }
    }
  }
}
```

## Always Handle Challenge First
```typescript
if (body.challenge) {
  return NextResponse.json({ challenge: body.challenge })
}
```

## Token Caching
Cache the token. It expires in 7200 seconds (2 hours).
Never fetch a new token on every request.
