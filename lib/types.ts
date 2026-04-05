export type Source = 'lark_scan' | 'lark_webhook' | 'chatwoot' | 'belive_os' | 'manual'
export type Agent = 'ceo' | 'cfo' | 'coo' | 'cto'
export type Priority = 'P1' | 'P2' | 'P3'
export type Severity = 'RED' | 'YELLOW' | 'GREEN'
export type IncidentStatus = 'new' | 'analysed' | 'awaiting_lee' | 'acting' | 'resolved' | 'archived'
export type TimelineEntryType = 'message' | 'silence_gap' | 'escalation' | 'lee_instruction' | 'ai_summary' | 'resolution' | 'system_note'

export type Incident = {
  id: string
  created_at: string
  updated_at: string
  source: Source
  source_message_id: string | null
  chat_id: string | null
  cluster: string | null
  group_name: string | null
  monitored_group_id: string | null
  agent: Agent
  problem_type: string | null
  priority: Priority
  severity: Severity
  title: string
  raw_content: string
  sender_name: string | null
  sender_open_id: string | null
  ai_summary: string | null
  ai_summary_at: string | null
  ai_proposal: string | null
  ai_reasoning: string | null
  ai_confidence: number
  status: IncidentStatus
  status_changed_at: string
  lee_action: string | null
  lee_instruction: string | null
  lee_decided_at: string | null
  sent_to_chat_id: string | null
  sent_at: string | null
  thread_keywords: string[]
  last_thread_message_at: string | null
  thread_message_count: number
  silence_hours: number
  has_lee_replied: boolean
  escalation_due_at: string | null
  escalated: boolean
  follow_up_count: number
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  auto_executed: boolean
  tags: string[]
}

export type IncidentTimeline = {
  id: string
  created_at: string
  incident_id: string
  entry_type: TimelineEntryType
  sender_name: string | null
  sender_open_id: string | null
  content: string
  lark_message_id: string | null
  is_lee: boolean
  metadata: Record<string, unknown> | null
}

export type IncidentStats = {
  total: number
  by_status: Record<string, number>
  by_severity: Record<string, number>
  by_cluster: Record<string, number>
  awaiting_lee: number
  overdue: number
}

export type MonitoredGroup = {
  id: string
  created_at: string
  chat_id: string
  group_name: string
  cluster: string
  cluster_color: string
  location: string | null
  group_type: string
  context: string | null
  agent: string
  scanning_enabled: boolean
  scan_frequency_minutes: number
  last_scanned_at: string | null
  message_count_total: number
  issue_count_total: number
  active_issues: number
}

export type ClusterHealth = {
  id: string
  updated_at: string
  cluster: string
  cluster_name: string
  chat_id: string
  health_status: 'red' | 'amber' | 'green'
  health_score: number
  maintenance_total: number
  maintenance_overdue: number
  maintenance_active: number
  maintenance_silent: number
  maintenance_max_age_days: number
  cleaning_total: number
  cleaning_overdue: number
  cleaning_active: number
  cleaning_silent: number
  cleaning_max_age_days: number
  move_in_pending: number
  move_in_overdue: number
  turnaround_total: number
  turnaround_warning: number
  turnaround_breach: number
  turnaround_max_days: number
  last_cluster_message_at: string | null
  cluster_silent_hours: number
  last_computed_at: string
  today_compliance: string | null
  standup_report_at: string | null
  brief_sent_today: boolean
  occ_sent_today: boolean
}
