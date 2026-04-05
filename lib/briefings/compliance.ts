import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendLarkMessage } from '@/lib/lark'
import { createIncident } from '@/lib/incidents'

const IOE_MAP: Record<string, string> = {
  C1: 'Nureen', C2: 'Intan', C3: 'Aireen', C4: 'Aliya', C5: 'Aliya',
  C6: 'Intan', C7: 'Mardhiah', C8: 'Mardhiah', C9: 'Intan', C10: 'Nureen', C11: 'Airen',
}

export async function checkAndRemindNonCompliant(): Promise<{ reminded: number }> {
  const today = new Date().toISOString().split('T')[0]
  let reminded = 0

  const { data: sessions } = await supabaseAdmin
    .from('standup_sessions')
    .select('*')
    .eq('session_date', today)
    .eq('compliance_status', 'pending')
    .eq('brief_sent', true)

  for (const session of sessions ?? []) {
    const ioe = IOE_MAP[session.cluster] ?? 'Team'
    const msg = `${ioe} — standup report belum masuk. Boleh post bila free? 🙏`

    const sent = await sendLarkMessage(session.chat_id, msg)

    await supabaseAdmin.from('standup_sessions').update({
      reminder_sent: true, reminder_sent_at: new Date().toISOString(),
      compliance_status: 'reminder_sent',
    }).eq('id', session.id)

    await supabaseAdmin.from('cluster_health_cache').update({ today_compliance: 'reminder_sent' }).eq('cluster', session.cluster)

    if (sent) reminded++
  }

  return { reminded }
}

export async function createNonComplianceIncidents(): Promise<{ created: number }> {
  const today = new Date().toISOString().split('T')[0]
  let created = 0

  const { data: sessions } = await supabaseAdmin
    .from('standup_sessions')
    .select('*')
    .eq('session_date', today)
    .in('compliance_status', ['pending', 'reminder_sent'])

  for (const session of sessions ?? []) {
    const ioe = IOE_MAP[session.cluster] ?? 'IOE'
    const incident = await createIncident({
      source: 'manual', cluster: session.cluster, chat_id: session.chat_id,
      agent: 'ceo', problem_type: 'people_escalation',
      priority: 'P2', severity: 'YELLOW',
      title: `Standup report not submitted — ${session.cluster} ${today}`,
      raw_content: `${ioe} did not submit standup report by 11am`,
      sender_name: 'Nucleus',
    })

    if (incident) {
      await supabaseAdmin.from('standup_sessions').update({
        compliance_status: 'non_compliant', incident_id: incident.id,
      }).eq('id', session.id)
      await supabaseAdmin.from('cluster_health_cache').update({ today_compliance: 'non_compliant' }).eq('cluster', session.cluster)
      created++
    }
  }

  return { created }
}
