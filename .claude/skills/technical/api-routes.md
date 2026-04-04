# Skill: Next.js API Routes (App Router)

## Standard Route Template
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    // 1. Parse and validate
    const body = await req.json()
    if (!body.required_field) {
      return NextResponse.json(
        { error: 'Missing required_field' },
        { status: 400 }
      )
    }

    // 2. Process
    const { data, error } = await supabaseAdmin
      .from('table')
      .insert({ ...body })
      .select()
      .single()

    if (error) throw error

    // 3. Return
    return NextResponse.json({ ok: true, data })

  } catch (error) {
    console.error('[route-name]', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

## Webhook Routes (Lark, Chatwoot)
Always return 200 immediately, process async:
```typescript
export async function POST(req: NextRequest) {
  // Return 200 first — webhook providers retry if they don't get fast response
  const body = await req.json()
  
  // Process in background
  processWebhook(body).catch(console.error)
  
  return NextResponse.json({ ok: true })
}
```

## Dynamic Routes
```typescript
// app/api/decisions/[id]/route.ts
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params
  // ...
}
```

## Rules
- Always try/catch
- Always validate input
- Webhooks return 200 immediately
- Never call your own API routes — import functions directly
