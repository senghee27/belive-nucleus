import { supabaseAdmin } from '@/lib/supabase-admin'
import { SchedulesManager } from '@/components/schedules/SchedulesManager'

export const dynamic = 'force-dynamic'

export default async function SchedulesPage() {
  const { data } = await supabaseAdmin
    .from('scan_schedules')
    .select('*')
    .order('created_at', { ascending: true })

  return <SchedulesManager initialSchedules={data ?? []} />
}
