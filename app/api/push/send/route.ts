import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { title, body, url, tag } = await req.json()
    if (!title) return NextResponse.json({ error: 'Missing title' }, { status: 400 })

    const { data: subs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('active', true)

    if (!subs || subs.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    const vapidPrivate = process.env.VAPID_PRIVATE_KEY
    const vapidEmail = process.env.VAPID_EMAIL ?? 'mailto:lee@belive.com.my'

    if (!vapidPublic || !vapidPrivate) {
      return NextResponse.json({ ok: true, sent: 0, warning: 'VAPID keys not configured' })
    }

    const webpush = await import('web-push')
    webpush.setVapidDetails(vapidEmail, vapidPublic, vapidPrivate)

    const payload = JSON.stringify({ title, body, url: url ?? '/m', tag })
    let sent = 0

    for (const sub of subs) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err) {
        // If subscription expired, deactivate it
        const statusCode = (err as { statusCode?: number })?.statusCode
        if (statusCode === 410 || statusCode === 404) {
          await supabaseAdmin.from('push_subscriptions').update({ active: false }).eq('endpoint', sub.endpoint)
        }
      }
    }

    return NextResponse.json({ ok: true, sent })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
