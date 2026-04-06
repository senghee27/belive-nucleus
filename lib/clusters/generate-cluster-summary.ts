import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase-admin'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type TicketItem = {
  id: string
  title: string
  category: string
  age_days: number
  owner_name: string
  unit: string
  sla_overdue: boolean
  ticket_id?: string
}

type ClusterData = {
  cluster: string
  cluster_name: string
  maintenance_items: TicketItem[]
  cleaning_items: TicketItem[]
  movein_items: TicketItem[]
  moveout_items: TicketItem[]
  total_maintenance: number
  total_cleaning: number
  total_movein: number
  total_moveout: number
  sla_breaches: number
}

async function generateClusterAISummary(data: ClusterData): Promise<string> {
  try {
    const contextText = `
Cluster: ${data.cluster} — ${data.cluster_name}

MAINTENANCE (${data.total_maintenance} total, ${data.sla_breaches} SLA breaches):
${data.maintenance_items.slice(0, 5).map(i => `- ${i.title} | ${i.age_days}d | ${i.owner_name} | Unit: ${i.unit} ${i.sla_overdue ? '[OVERDUE]' : ''}`).join('\n') || '(none)'}

CLEANING (${data.total_cleaning} total):
${data.cleaning_items.slice(0, 3).map(i => `- ${i.title} | ${i.age_days}d | ${i.owner_name}`).join('\n') || '(none)'}

MOVE IN (${data.total_movein} total):
${data.movein_items.slice(0, 3).map(i => `- ${i.title} | ${i.age_days}d | ${i.owner_name}`).join('\n') || '(none)'}

TURNAROUND (${data.total_moveout} total):
${data.moveout_items.slice(0, 3).map(i => `- ${i.title} | ${i.age_days}d | ${i.owner_name}`).join('\n') || '(none)'}
`

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 120,
      messages: [{
        role: 'user',
        content: `You are Chief of Staff briefing the CEO on cluster ${data.cluster} — ${data.cluster_name}.

${contextText}

Write exactly 2-3 sentences (max 200 characters total) that:
1. Identify any PATTERN or CONNECTION between issues (same unit, same tenant, same staff)
2. Name the staff member with the most concentration of open/overdue items
3. State ONE specific action needed TODAY

Rules:
- Be specific: name units, ticket IDs, staff names
- Never say "there are X tickets" — show insight, not counts
- Sound decisive, like a military briefing
- If issues are connected, say so explicitly

Output only the 2-3 sentences. Nothing else.`
      }]
    })

    return response.content[0].type === 'text' ? response.content[0].text.trim() : 'Summary unavailable.'
  } catch (error) {
    console.error(`[cluster-summary:${data.cluster}]`, error instanceof Error ? error.message : 'Unknown')
    return 'Summary generation failed.'
  }
}

function computeTopBlockers(data: ClusterData): TicketItem[] {
  const all = [
    ...data.maintenance_items.map(i => ({ ...i, category: 'maintenance' })),
    ...data.cleaning_items.map(i => ({ ...i, category: 'cleaning' })),
    ...data.movein_items.map(i => ({ ...i, category: 'move_in' })),
    ...data.moveout_items.map(i => ({ ...i, category: 'move_out' })),
  ]
  return all
    .sort((a, b) => {
      if (a.sla_overdue && !b.sla_overdue) return -1
      if (!a.sla_overdue && b.sla_overdue) return 1
      return b.age_days - a.age_days
    })
    .slice(0, 3)
}

export async function enrichClusterHealthCache(clusterId: string): Promise<void> {
  try {
    const { data: incidents } = await supabaseAdmin
      .from('incidents')
      .select('id, title, category, created_at, sender_name, raw_content, cluster, status')
      .eq('cluster', clusterId)
      .in('status', ['new', 'analysed', 'awaiting_lee', 'acting'])
      .order('created_at', { ascending: true })
      .limit(50)

    if (!incidents?.length) {
      await supabaseAdmin.from('cluster_health_cache').update({
        ai_summary: 'No open incidents for this cluster.',
        ai_summary_generated_at: new Date().toISOString(),
        top_blockers: [],
        top_maintenance: [],
        top_cleaning: [],
        top_movein: [],
        top_moveout: [],
      }).eq('cluster', clusterId)
      return
    }

    const now = new Date()
    const withAge: TicketItem[] = incidents.map(i => {
      const unitMatch = (i.title as string).match(/[A-Z]?-?\d{1,3}-?\d{1,3}[A-Z]?/i)
      return {
        id: i.id as string,
        title: i.title as string,
        category: (i.category as string) ?? 'other',
        age_days: Math.floor((now.getTime() - new Date(i.created_at as string).getTime()) / 86400000),
        owner_name: (i.sender_name as string) ?? 'Unknown',
        unit: unitMatch?.[0] ?? '—',
        sla_overdue: false, // Will check based on age
        ticket_id: i.id as string,
      }
    })

    // Mark overdue (> 48h = overdue for simplicity)
    withAge.forEach(i => { if (i.age_days > 2) i.sla_overdue = true })

    const byCategory = (cat: string) =>
      withAge.filter(i => i.category === cat || (cat === 'maintenance' && !['cleaning', 'move_in', 'move_out'].includes(i.category)))
        .sort((a, b) => {
          if (a.sla_overdue && !b.sla_overdue) return -1
          if (!a.sla_overdue && b.sla_overdue) return 1
          return b.age_days - a.age_days
        })

    const maintenanceItems = byCategory('maintenance')
    const cleaningItems = withAge.filter(i => i.category === 'cleaning').sort((a, b) => b.age_days - a.age_days)
    const moveinItems = withAge.filter(i => i.category === 'move_in').sort((a, b) => b.age_days - a.age_days)
    const moveoutItems = withAge.filter(i => i.category === 'move_out').sort((a, b) => b.age_days - a.age_days)

    const { data: cache } = await supabaseAdmin
      .from('cluster_health_cache')
      .select('cluster_name')
      .eq('cluster', clusterId)
      .single()

    const clusterData: ClusterData = {
      cluster: clusterId,
      cluster_name: (cache?.cluster_name as string) ?? clusterId,
      maintenance_items: maintenanceItems,
      cleaning_items: cleaningItems,
      movein_items: moveinItems,
      moveout_items: moveoutItems,
      total_maintenance: maintenanceItems.length,
      total_cleaning: cleaningItems.length,
      total_movein: moveinItems.length,
      total_moveout: moveoutItems.length,
      sla_breaches: withAge.filter(i => i.sla_overdue).length,
    }

    const aiSummary = await generateClusterAISummary(clusterData)
    const topBlockers = computeTopBlockers(clusterData)

    await supabaseAdmin.from('cluster_health_cache').update({
      ai_summary: aiSummary,
      ai_summary_generated_at: new Date().toISOString(),
      top_blockers: topBlockers,
      top_maintenance: maintenanceItems.slice(0, 3),
      top_cleaning: cleaningItems.slice(0, 2),
      top_movein: moveinItems.slice(0, 2),
      top_moveout: moveoutItems.slice(0, 2),
    }).eq('cluster', clusterId)

    console.log(`[cluster-summary:${clusterId}]`, `Enriched with AI summary + top items`)
  } catch (error) {
    console.error(`[cluster-summary:${clusterId}]`, error instanceof Error ? error.message : 'Unknown')
  }
}
