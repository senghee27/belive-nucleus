import { NextRequest, NextResponse } from 'next/server'
import { scanEnabledGroups } from '@/lib/scanner'

export async function POST(req: NextRequest) {
  try {
    const secret = req.headers.get('x-nucleus-secret')
    if (secret !== process.env.NUCLEUS_SECRET) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const results = await scanEnabledGroups()
    return NextResponse.json({ ok: true, ...results })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { supabaseAdmin } = await import('@/lib/supabase-admin')
    const { data } = await supabaseAdmin.from('incidents').select('*').order('created_at', { ascending: false }).limit(20)
    return NextResponse.json({ ok: true, incidents: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
