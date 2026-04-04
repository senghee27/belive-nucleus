import Anthropic from '@anthropic-ai/sdk'
import { supabaseAdmin } from '@/lib/supabase'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

type ProposeResult = {
  proposal: string
  reasoning: string
  confidence: number
}

const AGENT_ROLES: Record<string, string> = {
  ceo: 'CEO Twin — handles owner relationships, people escalations, and strategic decisions',
  cfo: 'CFO Twin — handles financial decisions, payouts, billing disputes, cash flow',
  coo: 'COO Twin — handles operations, maintenance, tenant complaints, emergencies',
  cto: 'CTO Twin — handles technical issues, bugs, feature requests, system problems',
}

function buildSystemPrompt(
  agent: string,
  problem_type: string,
  patternSummary: string | null,
  pastDecisions: string[]
): string {
  const role = AGENT_ROLES[agent] ?? 'Agent'

  let prompt = `You are Lee Seng Hee's digital twin — the ${role} for BeLive Property Hub.

BeLive Property Hub: co-living property management, Malaysia. 3,000+ rooms, 55+ condos, 11 clusters.

KEY PEOPLE:
- Fatihah: Operation Manager (all 11 clusters)
- Adam: OOE Lead
- Fariha: Maintenance Manager
- Linda (Rafflinda): Owner Relations Manager
- David: Housekeeping Manager
- Eason Tee: ED Fulfilment
- Keith Kuang: ED Revenue
- CJ Teoh: CBO

LEE'S DECISION PRINCIPLES:
1. Ops stability before revenue
2. Protect owner relationships first
3. P1 = respond within 2 hours always
4. No headcount without data justification
5. Financial decisions above RM5,000 = Lee approves
6. Confidence below 80% = always ask Lee

LEE'S COMMUNICATION STYLE:
- Direct and decisive. No fluff.
- Always names the specific person responsible
- Always includes specific deadlines
- Uses Manglish naturally when appropriate
- Example: "Fatihah — get Faris to M Vertica 12B by 6pm today. Update tenant directly. Waive the penalty if needed."

You are handling problem type: ${problem_type}`

  if (patternSummary && patternSummary !== 'Learning...') {
    prompt += `\n\nPATTERN FROM MEMORY:\n${patternSummary}`
  }

  if (pastDecisions.length > 0) {
    prompt += `\n\nPAST DECISIONS BY LEE (for reference):\n${pastDecisions.join('\n---\n')}`
  }

  prompt += `\n\nDraft a reply as Lee would write it. Be specific — name people, give deadlines, give clear instructions.

Respond ONLY in valid JSON. No markdown, no backticks, no explanation.
Format: {"proposal":"the exact reply Lee would send","reasoning":"why this is the right call","confidence":85}`

  return prompt
}

export async function proposeDecision(
  content: string,
  agent: string,
  problem_type: string,
  source: string
): Promise<ProposeResult> {
  try {
    // Fetch pattern from agent_memory
    const { data: memory } = await supabaseAdmin
      .from('agent_memory')
      .select('pattern_summary')
      .eq('agent', agent)
      .eq('problem_type', problem_type)
      .single()

    // Fetch last 5 similar decisions with final_reply
    const { data: pastRaw } = await supabaseAdmin
      .from('decisions')
      .select('ai_summary, final_reply, status')
      .eq('agent', agent)
      .eq('problem_type', problem_type)
      .not('final_reply', 'is', null)
      .order('created_at', { ascending: false })
      .limit(5)

    const pastDecisions = (pastRaw ?? []).map(
      (d) => `Issue: ${d.ai_summary}\nLee's reply: ${d.final_reply}\nAction: ${d.status}`
    )

    const systemPrompt = buildSystemPrompt(
      agent,
      problem_type,
      memory?.pattern_summary ?? null,
      pastDecisions
    )

    const msg = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{
        role: 'user',
        content: `Source: ${source}\nMessage: ${content}\n\nDraft a decision as Lee.`,
      }],
    })

    const text = msg.content[0].type === 'text' ? msg.content[0].text : '{}'
    console.log('[propose:raw]', text)

    try {
      const parsed = JSON.parse(text) as ProposeResult
      return {
        proposal: parsed.proposal,
        reasoning: parsed.reasoning,
        confidence: Math.min(100, Math.max(0, parsed.confidence)),
      }
    } catch {
      console.error('[propose:parse]', 'Failed to parse JSON', text)
      throw new Error('Proposer returned invalid JSON')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('[propose]', message)
    throw new Error(`Proposal failed: ${message}`)
  }
}
