import { supabaseAdmin } from '@/lib/supabase-admin'
import { IncidentPage } from '@/components/command/IncidentPage'
import Link from 'next/link'

export const dynamic = 'force-dynamic'

export default async function IncidentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params

  const { data: incident } = await supabaseAdmin
    .from('incidents')
    .select('*')
    .eq('id', id)
    .single()

  const { data: timeline } = await supabaseAdmin
    .from('incident_timeline')
    .select('*')
    .eq('incident_id', id)
    .order('created_at', { ascending: true })

  if (!incident) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <p className="text-sm text-[#4B5A7A]">Incident not found</p>
        <Link href="/command" className="text-xs text-[#F2784B] mt-2">← Back to Command</Link>
      </div>
    )
  }

  return <IncidentPage incident={incident} timeline={timeline ?? []} />
}
