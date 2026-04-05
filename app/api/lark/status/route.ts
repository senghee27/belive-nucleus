import { NextResponse } from 'next/server'
import { getTokenStatus } from '@/lib/lark-tokens'

export async function GET() {
  try {
    const status = await getTokenStatus()
    return NextResponse.json({ ok: true, ...status })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ ok: false, connected: false, error: message })
  }
}
