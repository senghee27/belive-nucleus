import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('category_learning_stats')
      .select('*')
      .order('total_proposals', { ascending: false })

    if (error) throw new Error(error.message)
    return NextResponse.json({ ok: true, categories: data ?? [] })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
