import { supabaseAdmin } from './supabase-admin'
import { mapPropertyToCluster } from './property-cluster-map'
import { generateSituationLine, shouldRegenerate, type SituationLineInput } from './tickets/situation-line'

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

  // Pre-fetch any existing rows in a single round trip so shouldRegenerate
  // can compare against prior state without N extra queries.
  const ticketIds = tickets.map(t => t.ticket_id)
  const priorMap = new Map<string, {
    ai_situation_line: string | null
    issue_description: string | null
    summary: string | null
    status: string | null
    age_days: number | null
  }>()
  if (ticketIds.length > 0) {
    const { data: priors } = await supabaseAdmin
      .from('ai_report_tickets')
      .select('ticket_id, ai_situation_line, issue_description, summary, status, age_days')
      .in('ticket_id', ticketIds)
      .eq('report_date', dateStr)
    for (const p of priors ?? []) {
      priorMap.set(p.ticket_id as string, {
        ai_situation_line: (p.ai_situation_line as string | null) ?? null,
        issue_description: (p.issue_description as string | null) ?? null,
        summary: (p.summary as string | null) ?? null,
        status: (p.status as string | null) ?? null,
        age_days: (p.age_days as number | null) ?? null,
      })
    }
  }

  for (const t of tickets) {
    try {
      // Decide whether to regenerate the AI situation line BEFORE the
      // upsert so we only pay for a Claude call when something material
      // changed. New tickets always regenerate (prior === null).
      const priorRow = priorMap.get(t.ticket_id) ?? null
      const situationInput: SituationLineInput = {
        issue_description: t.issue_description,
        summary: t.summary ?? null,
        unit_number: t.unit_number,
        property: t.property,
        owner_name: t.owner_name,
        owner_role: t.owner_role,
        status: priorRow?.status ?? 'open',
        age_days: t.age_days,
      }

      let ai_situation_line: string | null = priorRow?.ai_situation_line ?? null
      let ai_situation_generated_at: string | null = null
      if (shouldRegenerate(priorRow, situationInput)) {
        const result = await generateSituationLine(situationInput)
        ai_situation_line = result.line
        ai_situation_generated_at = new Date().toISOString()
      }

      const payload: Record<string, unknown> = {
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
        ai_situation_line,
      }
      if (ai_situation_generated_at) {
        payload.ai_situation_generated_at = ai_situation_generated_at
      }

      let { error } = await supabaseAdmin
        .from('ai_report_tickets')
        .upsert(payload, { onConflict: 'ticket_id,report_date' })

      // Pre-migration fallback: if ai_situation_line columns don't
      // exist yet in this environment, strip them and retry.
      if (error && /column .* does not exist/i.test(error.message) &&
          /ai_situation/i.test(error.message)) {
        delete payload.ai_situation_line
        delete payload.ai_situation_generated_at
        const retry = await supabaseAdmin
          .from('ai_report_tickets')
          .upsert(payload, { onConflict: 'ticket_id,report_date' })
        error = retry.error
      }

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
