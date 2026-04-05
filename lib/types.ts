export type Source = 'lark' | 'chatwoot' | 'belive_os'
export type Agent = 'ceo' | 'cfo' | 'coo' | 'cto'
export type Priority = 'P1' | 'P2' | 'P3'
export type DecisionStatus = 'pending' | 'approved' | 'edited' | 'rejected'

export type Event = {
  id: string
  created_at: string
  updated_at: string
  source: Source
  source_id: string | null
  source_type: string | null
  sender_name: string | null
  sender_id: string | null
  chat_id: string | null
  chat_name: string | null
  content: string
  raw_payload: Record<string, unknown> | null
  processed: boolean
}

export type Decision = {
  id: string
  created_at: string
  updated_at: string
  event_id: string | null
  source: Source | null
  agent: Agent | null
  problem_type: string | null
  priority: Priority
  ai_summary: string | null
  ai_proposal: string | null
  ai_reasoning: string | null
  ai_confidence: number
  status: DecisionStatus
  lee_edit: string | null
  final_reply: string | null
  auto_executed: boolean
  sent_at: string | null
  outcome: string | null
  lark_issue_id: string | null
}

export type AgentMemory = {
  id: string
  created_at: string
  updated_at: string
  agent: Agent
  problem_type: string
  pattern_summary: string | null
  approval_rate: number
  total_decisions: number
  approved_count: number
  autonomous: boolean
}

export type AgentSkill = {
  id: string
  created_at: string
  agent: Agent
  skill_name: string
  skill_prompt: string | null
  active: boolean
}
