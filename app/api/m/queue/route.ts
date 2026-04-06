import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .in('status', ['awaiting_lee'])
      .order('priority', { ascending: true })
      .order('created_at', { ascending: false })
      .limit(50)

    if (error) throw new Error(error.message)

    // Resolve sender names
    const ouIds = new Set<string>()
    for (const inc of data ?? []) {
      const name = inc.sender_name as string | null
      if (name?.startsWith('ou_')) ouIds.add(name)
    }
    const staffMap = new Map<string, string>()
    if (ouIds.size > 0) {
      const { data: staff } = await supabaseAdmin.from('staff_directory').select('open_id, name').in('open_id', [...ouIds])
      for (const s of staff ?? []) staffMap.set(s.open_id, s.name)
    }

    const resolved = (data ?? []).map(inc => ({
      ...inc,
      sender_name: staffMap.get(inc.sender_name as string) ?? inc.sender_name,
    }))

    return NextResponse.json({ ok: true, incidents: resolved })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
