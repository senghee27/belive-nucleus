import { supabaseAdmin } from '@/lib/supabase-admin'
import { DecisionTable } from '@/components/inbox/DecisionTable'
import type { Decision } from '@/lib/types'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  const { data, error } = await supabaseAdmin
    .from('decisions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('[inbox:fetch]', error.message)
  }

  return <DecisionTable initialData={(data as Decision[]) ?? []} />
}
