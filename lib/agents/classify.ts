import Anthropic from '@anthropic-ai/sdk'
import type { Agent, Priority } from '@/lib/types'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ClassifyResult = {
  agent: Agent
  problem_type: string
  priority: Priority
  summary: string
}

const SYSTEM_PROMPT = `You are a message classifier for BeLive Property Hub, a co-living property management company in Malaysia managing 3,000+ rooms across 55+ condominiums.

Your job is to classify incoming messages and determine:
1. Which agent should handle this (ceo, cfo, coo, cto)
2. What type of problem it is
3. What priority level

AGENT ASSIGNMENTS:
- coo: Operations — maintenance issues, tenant complaints, emergencies, daily ops
  Problem types: ops_maintenance, ops_tenant_complaint, ops_emergency
- cfo: Finance — payouts, billing disputes, cash flow, financial inquiries
  Problem types: finance_payout, finance_dispute, finance_inquiry
- ceo: Strategic — owner relationships, people escalations, strategy decisions
  Problem types: owner_relationship, people_escalation, strategy
- cto: Technical — tech bugs, feature requests, system issues
  Problem types: tech_bug, tech_feature, tech_support

PRIORITY RULES:
- P1: Emergency, safety issue, owner threatening exit, system down, cash crisis, tenant safety at risk
- P2: Unresolved >24hrs, revenue impact, staff conflict, owner unhappy but not threatening exit
- P3: Routine, informational, low urgency, standard requests

COMPANY CONTEXT:
- Leadership: Lee Seng Hee (Group CEO), Keith Kuang (Revenue), Eason Tee (Fulfilment), CJ Teoh (CBO/AI)
- Operations: Fatihah (Operation Manager), Adam (OOE Lead), Fariha (Maintenance Manager), Linda (Owner Relations)
- 11 clusters: C1=JB, C2=Penang, C3=Nilai, C4=Ampang, C5=Ara Damansara, C6=PJ, C7=Seri Kembangan, C8=Sentul, C9=Sg Besi, C10=Mont Kiara, C11=Cheras (M Vertica)

Respond ONLY in valid JSON. No markdown, no backticks, no explanation.
Format: {"agent":"...","problem_type":"...","priority":"...","summary":"..."}`

export async function classifyEvent(content: string, source: string): Promise<ClassifyResult> {
  try {
    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 300,
      system: SYSTEM_PROMPT,
      messages: [{
        role: 'user',
        content: `Source: ${source}\nMessage: ${content}`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    console.log('[classify:raw]', text)

    try {
      const parsed = JSON.parse(text) as ClassifyResult
      return {
        agent: parsed.agent,
        problem_type: parsed.problem_type,
        priority: parsed.priority,
        summary: parsed.summary,
      }
    } catch {
      console.error('[classify:parse]', 'Failed to parse JSON', text)
      throw new Error('Classifier returned invalid JSON')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[classify]', message)
    throw new Error(`Classification failed: ${message}`)
  }
}
