import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from './supabase-admin'
import { sendLarkMessage } from './lark'
import type { Incident, IncidentStatus, Priority, Severity, IncidentStats } from './types'
import { formatDistanceToNow } from 'date-fns'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
const LEE_OPEN_ID = process.env.LEE_LARK_CHAT_ID ?? ''
const ESCALATION_HOURS: Record<Priority, number> = { P1: 2, P2: 24, P3: 48 }

export async function classifyMessage(
  content: string,
  source: string,
  groupContext?: string
): Promise<{ agent: string; problem_type: string; priority: Priority; severity: Severity; title: string; is_incident: boolean }> {
  if (content.trim().length < 15) {
    return { agent: 'coo', problem_type: 'none', priority: 'P3', severity: 'GREEN', title: '', is_incident: false }
  }

  try {
    const ctx = groupContext ? `\nGroup context: ${groupContext}` : ''
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: `You classify BeLive Property Hub messages. Co-living operator, 3000+ rooms, 55+ condos, 11 clusters, Malaysia.${ctx}

AGENTS: coo (ops/maintenance/tenant), cfo (finance), ceo (owner/people), cto (tech)
SEVERITY: RED (emergency/safety/system down), YELLOW (needs attention), GREEN (routine)
PRIORITY: P1 (act within 2h), P2 (act within 24h), P3 (within 48h)

IMPORTANT — WHAT IS AN INCIDENT:
- Any message reporting a problem, complaint, damage, malfunction, urgent request = IS an incident (is_incident: true)
- Maintenance requests, water issues, AC problems, broken items = IS an incident
- Tenant complaints, owner complaints, payment issues = IS an incident
- Staff requesting help or escalating = IS an incident
- Messages with "URGENT", unit numbers, ticket numbers = almost always an incident

WHAT IS NOT AN INCIDENT:
- Short replies ONLY (ok, noted, will do, 👍, <15 chars) → is_incident: false
- Pure acknowledgements with no new information → is_incident: false
- Greetings, thank you messages → is_incident: false

RULES:
- One message = AT MOST one issue. Pick the MOST SEVERE if multiple.
- Title MUST include unit number AND property/cluster AND problem type
  GOOD: "Water bill abnormally high RM800 — RC A1-21-09"
  BAD: "Water issue reported"
- When in doubt, classify as incident. Better to flag too many than miss a real one.

Respond ONLY valid JSON:
{"is_incident":true,"agent":"coo","problem_type":"ops_maintenance","priority":"P2","severity":"YELLOW","title":"specific title"}`,
      messages: [{ role: 'user', content: `Source: ${source}\nMessage: ${content}` }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const parsed = JSON.parse(text)
    return {
      agent: parsed.agent ?? 'coo',
      problem_type: parsed.problem_type ?? 'ops_maintenance',
      priority: parsed.priority ?? 'P3',
      severity: parsed.severity ?? 'YELLOW',
      title: parsed.title ?? content.slice(0, 80),
      is_incident: parsed.is_incident ?? false,
    }
  } catch (error) {
    console.error('[incidents:classify]', error instanceof Error ? error.message : 'Unknown')
    return { agent: 'coo', problem_type: 'ops_maintenance', priority: 'P3', severity: 'YELLOW', title: content.slice(0, 80), is_incident: false }
  }
}

export async function proposeAction(
  incident: Incident,
  pastIncidents: Incident[]
): Promise<{ proposal: string; reasoning: string; confidence: number }> {
  try {
    const pastExamples = pastIncidents
      .filter(i => i.lee_instruction)
      .map(i => `Issue: ${i.title}\nLee said: ${i.lee_instruction}`)
      .join('\n---\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 600,
      system: `You are Lee Seng Hee's ${incident.agent.toUpperCase()} twin. BeLive Property Hub CEO. 3000+ rooms, Malaysia.

KEY PEOPLE: Fatihah (OM), Fariha (Maintenance), Adam (OOE Lead), Linda (Owner Relations), David (Housekeeping)
PRINCIPLES: Ops stability first. Protect owners. P1=2h response. RM5,000+ needs Lee. Name the specific PIC. Give specific deadlines.
STYLE: Direct, decisive, Manglish natural. Not a bot.
${pastExamples ? `\nPAST DECISIONS:\n${pastExamples}` : ''}

Respond ONLY valid JSON:
{"proposal":"exact instruction Lee would send","reasoning":"why this is right","confidence":85}`,
      messages: [{ role: 'user', content: `${incident.cluster}: ${incident.title}\n\nOriginal: ${incident.raw_content}` }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    const parsed = JSON.parse(text)
    return {
      proposal: parsed.proposal ?? '',
      reasoning: parsed.reasoning ?? '',
      confidence: Math.min(100, Math.max(0, parsed.confidence ?? 70)),
    }
  } catch (error) {
    console.error('[incidents:propose]', error instanceof Error ? error.message : 'Unknown')
    return { proposal: '', reasoning: 'Proposal generation failed', confidence: 0 }
  }
}

export async function createIncident(data: {
  source: string; source_message_id?: string; chat_id?: string; cluster?: string
  group_name?: string; monitored_group_id?: string; agent: string; problem_type: string
  priority: string; severity: string; title: string; raw_content: string
  sender_name?: string; sender_open_id?: string
}): Promise<Incident | null> {
  try {
    // Dedup check
    if (data.source_message_id) {
      const { data: existing } = await supabaseAdmin
        .from('incidents')
        .select('id')
        .eq('source_message_id', data.source_message_id)
        .single()
      if (existing) return null
    }

    const priority = data.priority as Priority
    const hours = ESCALATION_HOURS[priority] ?? 48
    const keywords = extractKeywords(data.title, data.raw_content)

    const { data: incident, error } = await supabaseAdmin
      .from('incidents')
      .insert({
        ...data,
        escalation_due_at: new Date(Date.now() + hours * 3600000).toISOString(),
        thread_keywords: keywords,
      })
      .select()
      .single()

    if (error) { console.error('[incidents:create]', error.message); return null }

    // First timeline entry
    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incident.id,
      entry_type: 'message',
      sender_name: data.sender_name,
      sender_open_id: data.sender_open_id,
      content: data.raw_content,
    })

    return incident as Incident
  } catch (error) {
    console.error('[incidents:create]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function analyseIncident(incidentId: string): Promise<Incident | null> {
  try {
    const { data: incident } = await supabaseAdmin.from('incidents').select('*').eq('id', incidentId).single()
    if (!incident) return null

    const { data: past } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .eq('problem_type', incident.problem_type)
      .not('lee_instruction', 'is', null)
      .order('created_at', { ascending: false })
      .limit(3)

    const { proposal, reasoning, confidence } = await proposeAction(incident as Incident, (past ?? []) as Incident[])

    const newStatus = confidence >= 95 && incident.priority !== 'P1' ? 'acting' : 'awaiting_lee'
    const autoExec = newStatus === 'acting'

    const { data: updated } = await supabaseAdmin
      .from('incidents')
      .update({
        ai_proposal: proposal,
        ai_reasoning: reasoning,
        ai_confidence: confidence,
        status: newStatus,
        status_changed_at: new Date().toISOString(),
        auto_executed: autoExec,
      })
      .eq('id', incidentId)
      .select()
      .single()

    return updated as Incident
  } catch (error) {
    console.error('[incidents:analyse]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function leeDecides(
  incidentId: string,
  action: 'approved' | 'edited' | 'rejected',
  editedInstruction?: string
): Promise<Incident | null> {
  try {
    const { data: incident } = await supabaseAdmin.from('incidents').select('*').eq('id', incidentId).single()
    if (!incident) return null

    const finalInstruction = action === 'approved' ? incident.ai_proposal
      : action === 'edited' ? editedInstruction
      : null

    const newStatus = action === 'rejected' ? 'archived' : 'acting'

    const { data: updated } = await supabaseAdmin
      .from('incidents')
      .update({
        lee_action: action,
        lee_instruction: finalInstruction,
        lee_decided_at: new Date().toISOString(),
        status: newStatus,
        status_changed_at: new Date().toISOString(),
      })
      .eq('id', incidentId)
      .select()
      .single()

    if (finalInstruction && incident.chat_id) {
      await sendLarkMessage(incident.chat_id, finalInstruction, 'chat_id')
      await supabaseAdmin.from('incidents').update({
        sent_to_chat_id: incident.chat_id,
        sent_at: new Date().toISOString(),
      }).eq('id', incidentId)

      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: incidentId,
        entry_type: 'lee_instruction',
        content: finalInstruction,
        is_lee: true,
        sender_name: 'Lee Seng Hee',
      })
    }

    if (action === 'rejected') {
      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: incidentId,
        entry_type: 'system_note',
        content: 'Lee rejected this incident',
      })
    }

    return updated as Incident
  } catch (error) {
    console.error('[incidents:decide]', error instanceof Error ? error.message : 'Unknown')
    return null
  }
}

export async function resolveIncident(incidentId: string, resolvedBy: string, note?: string): Promise<void> {
  try {
    await supabaseAdmin.from('incidents').update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolved_by: resolvedBy,
      resolution_note: note,
      status_changed_at: new Date().toISOString(),
    }).eq('id', incidentId)

    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incidentId,
      entry_type: 'resolution',
      content: `Resolved by ${resolvedBy}${note ? ': ' + note : ''}`,
    })

    const { data: incident } = await supabaseAdmin.from('incidents').select('cluster, title').eq('id', incidentId).single()
    if (incident && LEE_OPEN_ID) {
      sendLarkMessage(LEE_OPEN_ID, `✅ ${incident.cluster} ${incident.title} resolved by ${resolvedBy}`, 'open_id').catch(console.error)
    }
  } catch (error) {
    console.error('[incidents:resolve]', error instanceof Error ? error.message : 'Unknown')
  }
}

export async function generateSummary(incidentId: string): Promise<string> {
  try {
    const { data: entries } = await supabaseAdmin
      .from('incident_timeline')
      .select('*')
      .eq('incident_id', incidentId)
      .order('created_at', { ascending: true })
      .limit(20)

    if (!entries || entries.length === 0) return 'No thread data yet.'

    const conversation = entries.map(e => {
      const name = e.sender_name ?? (e.entry_type === 'silence_gap' ? '⏸' : 'System')
      return `${name} [${formatDistanceToNow(new Date(e.created_at), { addSuffix: true })}]: ${e.content}`
    }).join('\n')

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: 'Summarize this BeLive Property Hub ops conversation in 2-3 sentences. Focus on: action taken, current status, what is blocked, next step.',
      messages: [{ role: 'user', content: conversation }],
    })

    const summary = msg.content[0].type === 'text' ? msg.content[0].text : ''

    await supabaseAdmin.from('incidents').update({ ai_summary: summary, ai_summary_at: new Date().toISOString() }).eq('id', incidentId)
    await supabaseAdmin.from('incident_timeline').insert({
      incident_id: incidentId,
      entry_type: 'ai_summary',
      content: summary,
      metadata: { summary_at: new Date().toISOString() },
    })

    return summary
  } catch (error) {
    console.error('[incidents:summary]', error instanceof Error ? error.message : 'Unknown')
    return 'Summary failed.'
  }
}

export async function checkSilenceAndEscalate(): Promise<{ escalated: number }> {
  try {
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('*')
      .not('status', 'in', '("resolved","archived")')
      .eq('escalated', false)
      .not('escalation_due_at', 'is', null)
      .lt('escalation_due_at', new Date().toISOString())

    let count = 0
    for (const inc of incidents ?? []) {
      const newSeverity = inc.severity === 'GREEN' ? 'YELLOW' : 'RED'
      await supabaseAdmin.from('incidents').update({
        severity: newSeverity,
        escalated: true,
        follow_up_count: (inc.follow_up_count ?? 0) + 1,
      }).eq('id', inc.id)

      await supabaseAdmin.from('incident_timeline').insert({
        incident_id: inc.id,
        entry_type: 'escalation',
        content: `Auto-escalated from ${inc.severity} to ${newSeverity}`,
      })
      count++
    }

    if (count > 0 && LEE_OPEN_ID) {
      sendLarkMessage(LEE_OPEN_ID, `⚠️ ${count} incident(s) escalated. View: https://belive-nucleus.vercel.app/command`, 'open_id').catch(console.error)
    }

    return { escalated: count }
  } catch (error) {
    console.error('[incidents:escalate]', error instanceof Error ? error.message : 'Unknown')
    return { escalated: 0 }
  }
}

export async function getIncidents(filters?: {
  status?: string | string[]; cluster?: string; severity?: string; limit?: number
}): Promise<Incident[]> {
  try {
    let query = supabaseAdmin.from('incidents').select('*')

    if (filters?.status) {
      if (Array.isArray(filters.status)) {
        query = query.in('status', filters.status)
      } else {
        query = query.eq('status', filters.status)
      }
    }
    if (filters?.cluster) query = query.eq('cluster', filters.cluster)
    if (filters?.severity) query = query.eq('severity', filters.severity)

    query = query.order('priority', { ascending: true }).order('created_at', { ascending: false })

    if (filters?.limit) query = query.limit(filters.limit)

    const { data } = await query
    return (data ?? []) as Incident[]
  } catch (error) {
    console.error('[incidents:get]', error instanceof Error ? error.message : 'Unknown')
    return []
  }
}

export async function getIncidentStats(): Promise<IncidentStats> {
  try {
    const { data } = await supabaseAdmin.from('incidents').select('status, severity, cluster, escalation_due_at, escalated')

    const stats: IncidentStats = {
      total: (data ?? []).length,
      by_status: {}, by_severity: {}, by_cluster: {},
      awaiting_lee: 0, overdue: 0,
    }

    for (const inc of data ?? []) {
      stats.by_status[inc.status] = (stats.by_status[inc.status] ?? 0) + 1
      stats.by_severity[inc.severity] = (stats.by_severity[inc.severity] ?? 0) + 1
      if (inc.cluster) stats.by_cluster[inc.cluster] = (stats.by_cluster[inc.cluster] ?? 0) + 1
      if (inc.status === 'awaiting_lee') stats.awaiting_lee++
      if (inc.escalation_due_at && new Date(inc.escalation_due_at).getTime() < Date.now() && !inc.escalated) stats.overdue++
    }

    return stats
  } catch { return { total: 0, by_status: {}, by_severity: {}, by_cluster: {}, awaiting_lee: 0, overdue: 0 } }
}

export function extractKeywords(title: string, content: string): string[] {
  const text = `${title} ${content}`.toLowerCase()
  const keywords = new Set<string>()

  const unitMatches = text.match(/\b[a-z]?\d+[-]?\d*[a-z]?\b/gi) ?? []
  for (const u of unitMatches) keywords.add(u.toLowerCase())

  const opsWords = ['ac', 'rosak', 'bocor', 'lift', 'electric', 'water', 'pipe', 'leak', 'flood', 'paip', 'lampu', 'lamp', 'sink', 'aircon', 'repair', 'contractor']
  const propertyNames = ['vertica', 'epic', 'bayu', 'bora', 'vivo', 'rubica', 'acacia', 'astoria', 'platinum', 'avila', 'perla', 'azure', 'emporis', 'armani', 'highpark', 'meta', 'rica', 'birch', 'unio', 'arte', 'trion', 'razak', 'ooak', 'andes']

  for (const w of text.split(/[\s,.\-—:;/()]+/).filter(w => w.length >= 2)) {
    if (opsWords.includes(w) || propertyNames.includes(w)) keywords.add(w)
  }

  return Array.from(keywords).slice(0, 15)
}
