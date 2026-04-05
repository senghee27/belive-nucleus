import { NextRequest, NextResponse } from 'next/server'
import { getTenantToken } from '@/lib/lark-tokens'

export async function POST(req: NextRequest) {
  try {
    const { chat_id } = await req.json()
    if (!chat_id) return NextResponse.json({ valid: false, error: 'chat_id required' })

    const token = await getTenantToken()
    const res = await fetch(
      `https://open.larksuite.com/open-apis/im/v1/chats/${chat_id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    )

    const data = await res.json()

    if (data.code === 0) {
      return NextResponse.json({
        valid: true,
        group_info: {
          name: data.data?.name ?? 'Unknown',
          member_count: data.data?.member_count ?? 0,
        },
      })
    }

    return NextResponse.json({
      valid: false,
      error: data.code === 230001 ? 'Bot not in group' : data.msg ?? 'Group not found',
    })
  } catch (error) {
    return NextResponse.json({ valid: false, error: error instanceof Error ? error.message : 'Unknown' })
  }
}
