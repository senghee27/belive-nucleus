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
  category: string
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

export type NucleusSession = {
  open_id: string
  name: string
  role: 'admin' | 'viewer'
  lark_access_token: string
  lark_token_expires_at: number
  session_expires_at: number
  issued_at: number
}

export const ISSUE_CATEGORIES: Record<string, { label: string; icon: string; color: string }> = {
  air_con: { label: 'Air Con', icon: '🌬️', color: '#4BB8F2' },
  plumbing: { label: 'Plumbing / Leak', icon: '💧', color: '#4BB8F2' },
  electrical: { label: 'Electrical', icon: '⚡', color: '#E8A838' },
  lift: { label: 'Lift', icon: '🛗', color: '#9B6DFF' },
  door_lock: { label: 'Door / Lock', icon: '🚪', color: '#4B5A7A' },
  water_heater: { label: 'Water Heater', icon: '🌡️', color: '#F2784B' },
  general_repair: { label: 'General Repair', icon: '🔨', color: '#4B5A7A' },
  structural: { label: 'Structural', icon: '🧱', color: '#E05252' },
  pest: { label: 'Pest', icon: '🦟', color: '#E8A838' },
  cleaning: { label: 'Cleaning', icon: '🧹', color: '#4BF2A2' },
  hygiene: { label: 'Hygiene / Waste', icon: '🗑️', color: '#4BF2A2' },
  move_in: { label: 'Move In', icon: '🚶', color: '#4BF2A2' },
  move_out: { label: 'Move Out', icon: '📦', color: '#E8A838' },
  access_card: { label: 'Access Card', icon: '🔑', color: '#9B6DFF' },
  onboarding: { label: 'Onboarding', icon: '📋', color: '#4BB8F2' },
  safety: { label: 'Safety Issue', icon: '🚨', color: '#E05252' },
  eviction: { label: 'Eviction', icon: '⚖️', color: '#E05252' },
  payment: { label: 'Payment', icon: '💰', color: '#E8A838' },
  complaint: { label: 'Complaint', icon: '📣', color: '#F27BAD' },
  other: { label: 'Other', icon: '❓', color: '#4B5A7A' },
}

export type BriefingReportStatus = 'draft' | 'pending_review' | 'approved' | 'sent' | 'failed' | 'discarded'

export type BriefingDestination = {
  chat_id: string
  name: string
  type: 'cluster_group' | 'function_group' | 'lee_dm' | 'ai_report'
  selected: boolean
}

export type BriefingGenerationLog = {
  sources_read: { name: string; scanned_at: string; record_count: number; success: boolean }[]
  ai_reasoning: string
  processing_start: string
  processing_end: string
  duration_seconds: number
  tokens_used: number
  model: string
  errors: string[]
}

export type BriefingReport = {
  id: string
  created_at: string
  updated_at: string
  report_type: string
  report_name: string
  cluster: string | null
  scheduled_for: string | null
  generated_at: string | null
  content: string
  content_original: string
  generation_log: BriefingGenerationLog
  destinations: BriefingDestination[]
  status: BriefingReportStatus
  lee_edited: boolean
  lee_approved_at: string | null
  sent_at: string | null
  sent_to: { chat_id: string; name: string; success: boolean; error?: string }[] | null
  send_error: string | null
  was_auto_sent: boolean
}

export type BriefingAutosendConfig = {
  id: string
  updated_at: string
  report_type: string
  auto_send_enabled: boolean
  consecutive_approvals: number
  total_approvals: number
  total_reviews: number
  approval_rate: number
  last_approved_at: string | null
  last_sent_at: string | null
  required_consecutive_approvals: number
  auto_send_eligible: boolean
}

export const REPORT_TYPE_META: Record<string, { icon: string; label: string; group: string }> = {
  MORNING_BRIEF: { icon: '🌅', label: 'Morning Brief', group: 'daily' },
  MIDDAY_PULSE: { icon: '☀️', label: 'Midday Pulse', group: 'daily' },
  EOD_SUMMARY: { icon: '🌙', label: 'EOD Summary', group: 'daily' },
  STANDUP_BRIEF: { icon: '📋', label: 'Standup Brief', group: 'cluster' },
  COMPLIANCE_ALERT: { icon: '⚠️', label: 'Compliance Alert', group: 'cluster' },
  WEEKLY_OPS: { icon: '📊', label: 'Weekly Ops', group: 'management' },
  MONTHLY_REPORT: { icon: '📅', label: 'Monthly Report', group: 'management' },
  OWNER_SATISFACTION: { icon: '🏠', label: 'Owner Satisfaction', group: 'management' },
  CLUSTER_SNAPSHOT: { icon: '🔍', label: 'Cluster Snapshot', group: 'on_demand' },
  INCIDENT_SUMMARY: { icon: '⚡', label: 'Incident Summary', group: 'on_demand' },
  SALES_SNAPSHOT: { icon: '💰', label: 'Sales Snapshot', group: 'on_demand' },
}
