import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET() {
  try {
    // Aggregate top tags across all categories
    const { data, error } = await supabaseAdmin
      .from('category_learning_stats')
      .select('top_tags')

    if (error) throw new Error(error.message)

    const counts = new Map<string, number>()
    for (const row of (data ?? []) as Array<{ top_tags: { tag: string; count: number }[] }>) {
      for (const t of row.top_tags ?? []) {
        counts.set(t.tag, (counts.get(t.tag) ?? 0) + t.count)
      }
    }

    const patterns = [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([tag, count]) => ({ tag, count }))

    return NextResponse.json({ ok: true, patterns })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown' }, { status: 500 })
  }
}
