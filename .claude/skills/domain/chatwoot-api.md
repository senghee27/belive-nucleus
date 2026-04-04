# Skill: Chatwoot Integration (Self-Hosted)

## API Base
```
process.env.CHATWOOT_URL + /api/v1
```

## Auth Header
```
api_access_token: process.env.CHATWOOT_API_TOKEN
```

## Send Reply
```typescript
await fetch(
  `${process.env.CHATWOOT_URL}/api/v1/accounts/${accountId}/conversations/${conversationId}/messages`,
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      api_access_token: process.env.CHATWOOT_API_TOKEN!
    },
    body: JSON.stringify({
      content: message,
      message_type: 'outgoing',
      private: false
    })
  }
)
```

## Webhook Payload (incoming message)
```typescript
type ChatwootWebhookPayload = {
  event: 'message_created'
  message_type: 'incoming' | 'outgoing'
  content: string
  account: { id: number }
  conversation: {
    id: number
    meta: {
      sender: { name: string, email: string }
    }
  }
  sender: {
    name: string
    email: string
    type: 'contact' | 'agent'
  }
}
```

## Rules
- Only process message_type === 'incoming'
- Only process event === 'message_created'
- Ignore outgoing messages to prevent reply loops
- Self-hosted — no rate limits to worry about
