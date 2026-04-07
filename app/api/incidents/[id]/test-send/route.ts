import { NextRequest, NextResponse } from 'next/server'

const TEST_CHAT_ID = 'oc_585301f0077f09015428801da0cba90d'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params
    const body = await req.json()
    const message = body.message as string

    if (!message) return NextResponse.json({ error: 'Missing message' }, { status: 400 })

    // Get Lee's user token — fail clearly if expired
    let token: string
    try {
      const { getLeeUserToken } = await import('@/lib/lark-tokens')
      token = await getLeeUserToken()
    } catch {
      return NextResponse.json({
        error: 'Lee\'s Lark token expired. Please re-login at /auth/login.',
        token_expired: true,
      }, { status: 401 })
    }

    // Resolve @mentions before sending
    const { detectMentionsInText } = await import('@/lib/staff-directory')
    const mentions = await detectMentionsInText(message)
    let larkContent = `[TEST] ${message}`
    for (const m of mentions) {
      const firstName = m.name.split(' ')[0]
      const nameRegex = new RegExp(`\\b${firstName}\\b`, 'i')
      larkContent = larkContent.replace(nameRegex, `<at user_id="${m.openId}">${firstName}</at>`)
    }

    // Send directly to test group using Lee's token
    const { getSafeChatId } = await import('@/lib/lark')
    const safeChatId = getSafeChatId(TEST_CHAT_ID, 'chat_id')

    const res = await fetch(
      'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          receive_id: safeChatId,
          msg_type: 'text',
          content: JSON.stringify({ text: larkContent }),
        }),
      }
    )

    const resData = await res.json()
    const sent = resData.code === 0

    if (!sent) {
      console.error('[test-send]', `Lark error: ${resData.code} ${resData.msg}`)
      return NextResponse.json({ ok: false, error: `Lark: ${resData.msg ?? resData.code}` })
    }

    return NextResponse.json({ ok: true, sent_to: 'Nucleus Testing Group', message_id: resData.data?.message_id })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
