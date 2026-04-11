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
  // Reasoning Trace + Backend Upgrade (migration 20260411000000)
  lark_root_id: string | null
  assigned_to: string | null
  min_reasoning_confidence: number | null
  merged_from_incident_id: string | null
  merge_count: number
  // Cluster Health War Room (migration 20260411130000)
  situation_summary: string | null  // ≤140 char one-liner for war-room rows
  is_classified: boolean            // false = amber "[unclassified]" fallback
  raw_lark_text: string | null      // preserved raw Lark text for fallback render
}

export type ReasoningStepName =
  | 'matching'
  | 'is_incident'
  | 'classification'
  | 'priority'
  | 'routing'
  | 'voice_fit'

export type ReasoningTrace = {
  id: string
  incident_id: string
  step_name: ReasoningStepName
  step_order: number
  decision: string
  decision_detail: Record<string, unknown>
  confidence: number
  reasoning_text: string
  narrative_text: string | null
  narrative_generated_at: string | null
  model_version: string | null
  generated_by: 'deterministic' | 'llm'
  input_signal: Record<string, unknown>
  created_at: string
}

export const REASONING_FEEDBACK_TAGS = [
  'wrong_matching',
  'wrong_classification',
  'wrong_priority',
  'wrong_routing',
  'wrong_voice_fit',
] as const

export type ReasoningFeedbackTag = typeof REASONING_FEEDBACK_TAGS[number]

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
  ai_summary: string | null
  ai_summary_generated_at: string | null
  top_blockers: { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }[]
  top_maintenance: { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }[]
  top_cleaning: { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }[]
  top_movein: { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }[]
  top_moveout: { id: string; title: string; category: string; age_days: number; owner_name: string; unit: string; sla_overdue: boolean }[]
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

// War Room category grouping — maps raw ISSUE_CATEGORIES keys into
// the 5 buckets the /clusters war-room view renders per cluster.
// Any category not listed falls through into 'incidents'.
export type WarRoomCategoryGroup =
  | 'maintenance'
  | 'cleaning'
  | 'move_in'
  | 'move_out'
  | 'incidents'

export const WAR_ROOM_CATEGORY_MAP: Record<string, WarRoomCategoryGroup> = {
  air_con: 'maintenance',
  plumbing: 'maintenance',
  electrical: 'maintenance',
  lift: 'maintenance',
  door_lock: 'maintenance',
  water_heater: 'maintenance',
  general_repair: 'maintenance',
  structural: 'maintenance',
  cleaning: 'cleaning',
  hygiene: 'cleaning',
  pest: 'cleaning',
  move_in: 'move_in',
  onboarding: 'move_in',
  move_out: 'move_out',
  access_card: 'incidents',
  safety: 'incidents',
  eviction: 'incidents',
  payment: 'incidents',
  complaint: 'incidents',
  other: 'incidents',
}

export function categoryGroup(category: string | null | undefined): WarRoomCategoryGroup {
  if (!category) return 'incidents'
  return WAR_ROOM_CATEGORY_MAP[category] ?? 'incidents'
}

export const WAR_ROOM_GROUP_LABEL: Record<WarRoomCategoryGroup, string> = {
  maintenance: 'Maintenance',
  cleaning: 'Cleaning',
  move_in: 'Move In',
  move_out: 'Move Out',
  incidents: 'Incidents',
}

export const WAR_ROOM_GROUP_LIMIT: Record<WarRoomCategoryGroup, number> = {
  maintenance: 10,
  cleaning: 3,
  move_in: 3,
  move_out: 3,
  incidents: 3,
}

export const WAR_ROOM_GROUP_ORDER: readonly WarRoomCategoryGroup[] = [
  'maintenance',
  'cleaning',
  'move_in',
  'move_out',
  'incidents',
] as const

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

export type ProposalRevision = {
  id: string
  incident_id: string
  version_number: number
  proposal_text: string
  ai_confidence: number | null
  feedback_text: string | null
  feedback_tags: string[]
  is_final: boolean
  outcome: 'approved' | 'edited' | 'discarded' | 'pending'
  ai_prompt_tokens: number | null
  ai_completion_tokens: number | null
  past_feedback_injected: boolean
  created_at: string
  decided_at: string | null
  reasoning_feedback_tags: ReasoningFeedbackTag[]
}

export type RevisionFeedback = {
  tags: string[]
  text: string
}

export type CategoryLearningStats = {
  id: string
  category: string
  total_proposals: number
  approved_v1: number
  approved_edited: number
  discarded: number
  acceptance_rate: number
  edit_rate: number
  last_20_outcomes: string[]
  consecutive_approvals: number
  auto_send_eligible: boolean
  auto_send_enabled: boolean
  top_tags: { tag: string; count: number }[]
  updated_at: string
}

export type CategoryFeedbackRule = {
  rule: string
  source_count: number
  example_feedback: string
}

export type FeedbackTag =
  | 'Wrong person'
  | 'Wrong tone'
  | 'Missing deadline'
  | 'Missing context'
  | 'Too aggressive'
  | 'Too soft'
  | string

export const DEFAULT_FEEDBACK_TAGS: FeedbackTag[] = [
  'Wrong person',
  'Wrong tone',
  'Missing deadline',
  'Missing context',
  'Too aggressive',
  'Too soft',
]

export const FEEDBACK_TAG_COLORS: Record<string, string> = {
  'Wrong person': '#E8A838',
  'Wrong tone': '#9B6DFF',
  'Missing deadline': '#4BB8F2',
  'Missing context': '#4BF2A2',
  'Too aggressive': '#E05252',
  'Too soft': '#8A9BB8',
}

export type BriefingCronRun = {
  id: string
  created_at: string
  report_type: string
  cluster: string | null
  triggered_by: 'cron' | 'manual' | 'retry'
  triggered_by_user: string | null
  started_at: string
  completed_at: string | null
  duration_seconds: number | null
  status: 'running' | 'success' | 'failed' | 'skipped'
  error_message: string | null
  retry_count: number
  report_id: string | null
  sources_attempted: { name: string; type: string }[]
  sources_succeeded: { name: string; type: string; record_count?: number; completed_at?: string }[]
  sources_failed: { name: string; type: string; error?: string }[]
  tokens_used: number | null
  model: string | null
  skip_reason: string | null
}

export type BriefingScheduleConfig = {
  id: string
  updated_at: string
  report_type: string
  report_name: string
  report_icon: string
  category: 'daily' | 'cluster' | 'management' | 'on_demand'
  enabled: boolean
  cron_expression: string | null
  schedule_description: string | null
  timezone: string
  is_per_cluster: boolean
  default_destinations: { chat_id: string; name: string; type: string; selected: boolean }[]
  last_run_at: string | null
  last_run_status: string | null
  last_report_id: string | null
  next_run_at: string | null
  total_runs: number
  successful_runs: number
  failed_runs: number
  success_rate: number
  recent_runs?: BriefingCronRun[]
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
