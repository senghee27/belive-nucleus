import { supabaseAdmin } from './supabase-admin'
import { mapPropertyToCluster } from './property-cluster-map'

export type ParsedTicket = {
  ticket_id: string
  ticket_number: number
  age_days: number
  sla_date: string | null
  sla_overdue: boolean
  owner_role: string | null
  owner_name: string | null
  property: string
  cluster: string | null
  unit_number: string | null
  room: string | null
  issue_description: string
  summary: string
  source_lark_message_id: string
}

export function parseAIReportMessage(content: string, messageId: string): ParsedTicket[] {
  const tickets: ParsedTicket[] = []

  // Extract property from title
  const titleMatch = content.match(/Master Livability Report\s*[—–-]\s*(.+?)\s*[—–-]\s*\d+/i)
  const reportProperty = titleMatch?.[1]?.trim() ?? ''

  // Split by ticket blocks: #N —
  const blocks = content.split(/(?=#\d+\s*[—–-])/)

  for (const block of blocks) {
    try {
      const numMatch = block.match(/^#(\d+)\s*[—–-]/)
      if (!numMatch) continue

      const ticketNumber = parseInt(numMatch[1])

      // Extract ticket ID
      const ticketIdMatch = block.match(/BLV-RQ-\d+/)
      if (!ticketIdMatch) continue
      const ticketId = ticketIdMatch[0]

      // Extract age
      const ageMatch = block.match(/([\d.]+)\s*days?\s*old/i)
      const ageDays = ageMatch ? parseFloat(ageMatch[1]) : 0

      // Extract SLA date
      const slaMatch = block.match(/SLA:\s*(\d{2}\s+\w+\s+\d{4})/i)
      let slaDate: string | null = null
      let slaOverdue = false
      if (slaMatch) {
        try {
          const parsed = new Date(slaMatch[1])
          if (!isNaN(parsed.getTime())) {
            slaDate = parsed.toISOString().split('T')[0]
            slaOverdue = parsed < new Date()
          }
        } catch { /* ignore parse error */ }
      }

      // Extract owner
      const ownerMatch = block.match(/Owner:\s*\[(\w+)\]\s*([^\]]+?)(?:\]|$)/i)
      const ownerRole = ownerMatch?.[1] ?? null
      const ownerName = ownerMatch?.[2]?.trim() ?? null

      // Extract property from block or use report title
      const lines = block.split('\n').map(l => l.trim()).filter(Boolean)
      let property = reportProperty
      let unitNumber: string | null = null
      let room: string | null = null

      // Look for property/unit line (usually after owner line)
      for (const line of lines) {
        const unitMatch = line.match(/([A-Z])-(\d{1,3})-(\d{1,3})/i)
        if (unitMatch) {
          unitNumber = unitMatch[0]
          // Property is usually at start of this line
          const propPart = line.split('-')[0]?.trim()
          if (propPart && propPart.length > 3) property = propPart
        }
        const roomMatch = line.match(/Room\s*[-–]\s*(\d+)/i)
        if (roomMatch) room = `Room ${roomMatch[1]}`
      }

      // Extract issue description
      const issueMatch = block.match(/Issue:\s*(.+)/i)
      const issueDescription = issueMatch?.[1]?.trim() ?? 'Unknown issue'

      // Extract summary
      const summaryMatch = block.match(/Summary:\s*(.+)/i)
      const summary = summaryMatch?.[1]?.trim()?.split('\n')[0] ?? issueDescription

      const cluster = mapPropertyToCluster(property)

      tickets.push({
        ticket_id: ticketId,
        ticket_number: ticketNumber,
        age_days: ageDays,
        sla_date: slaDate,
        sla_overdue: slaOverdue,
        owner_role: ownerRole,
        owner_name: ownerName,
        property,
        cluster,
        unit_number: unitNumber,
        room,
        issue_description: issueDescription,
        summary,
        source_lark_message_id: messageId,
      })
    } catch (error) {
      console.error('[aiReport:parse]', error instanceof Error ? error.message : 'Unknown')
    }
  }

  return tickets
}

export async function upsertTickets(tickets: ParsedTicket[], reportDate: Date): Promise<number> {
  let count = 0
  const dateStr = reportDate.toISOString().split('T')[0]

  for (const t of tickets) {
    try {
      const { error } = await supabaseAdmin
        .from('ai_report_tickets')
        .upsert({
          report_date: dateStr,
          ticket_id: t.ticket_id,
          ticket_number: t.ticket_number,
          age_days: t.age_days,
          sla_date: t.sla_date,
          sla_overdue: t.sla_overdue,
          owner_role: t.owner_role,
          owner_name: t.owner_name,
          property: t.property,
          cluster: t.cluster,
          unit_number: t.unit_number,
          room: t.room,
          issue_description: t.issue_description,
          summary: t.summary,
          source_lark_message_id: t.source_lark_message_id,
        }, { onConflict: 'ticket_id,report_date' })

      if (!error) count++
    } catch (error) {
      console.error('[aiReport:upsert]', error instanceof Error ? error.message : 'Unknown')
    }
  }

  return count
}

export async function getOpenTickets(options?: { cluster?: string; sla_overdue?: boolean }) {
  try {
    let query = supabaseAdmin.from('ai_report_tickets').select('*').eq('status', 'open')
    if (options?.cluster) query = query.eq('cluster', options.cluster)
    if (options?.sla_overdue !== undefined) query = query.eq('sla_overdue', options.sla_overdue)
    query = query.order('sla_overdue', { ascending: false }).order('age_days', { ascending: false })
    const { data } = await query
    return data ?? []
  } catch { return [] }
}
