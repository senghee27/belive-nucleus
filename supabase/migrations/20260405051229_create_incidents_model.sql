-- ============================================
-- Migration: Unified Incident Model
-- Replaces: lark_issues, decisions, issue_follow_ups, issue_timeline_entries
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- Drop old tables
drop table if exists issue_timeline_entries cascade;
drop table if exists issue_follow_ups cascade;
drop table if exists lark_issues cascade;
drop table if exists decisions cascade;

-- Also drop agent_memory and agent_skills (will rebuild later if needed)
-- Keep: lark_group_messages, lark_tokens, monitored_groups, scan_schedules, scan_logs, events

-- 1. INCIDENTS TABLE
create table incidents (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  source text not null,
  source_message_id text unique,
  chat_id text,
  cluster text,
  group_name text,
  monitored_group_id uuid references monitored_groups(id),
  agent text not null default 'coo',
  problem_type text,
  priority text not null default 'P3',
  severity text not null default 'YELLOW',
  title text not null,
  raw_content text not null,
  sender_name text,
  sender_open_id text,
  ai_summary text,
  ai_summary_at timestamptz,
  ai_proposal text,
  ai_reasoning text,
  ai_confidence int default 0,
  status text not null default 'new',
  status_changed_at timestamptz default now(),
  lee_action text,
  lee_instruction text,
  lee_decided_at timestamptz,
  sent_to_chat_id text,
  sent_at timestamptz,
  thread_keywords text[],
  last_thread_message_at timestamptz,
  thread_message_count int default 0,
  silence_hours numeric default 0,
  has_lee_replied boolean default false,
  escalation_due_at timestamptz,
  escalated boolean default false,
  follow_up_count int default 0,
  resolved_at timestamptz,
  resolved_by text,
  resolution_note text,
  auto_executed boolean default false,
  tags text[]
);

create trigger set_updated_at_incidents
  before update on incidents
  for each row execute function update_updated_at();

alter table incidents enable row level security;
create policy "service_role_all_incidents" on incidents for all using (true) with check (true);

create index idx_incidents_status on incidents(status);
create index idx_incidents_cluster on incidents(cluster);
create index idx_incidents_priority on incidents(priority);
create index idx_incidents_severity on incidents(severity);
create index idx_incidents_created_at on incidents(created_at);
create index idx_incidents_group_id on incidents(monitored_group_id);
create index idx_incidents_source_msg on incidents(source_message_id);

alter publication supabase_realtime add table incidents;

-- 2. INCIDENT TIMELINE
create table incident_timeline (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  incident_id uuid references incidents(id) on delete cascade not null,
  entry_type text not null,
  sender_name text,
  sender_open_id text,
  content text not null,
  lark_message_id text,
  is_lee boolean default false,
  metadata jsonb
);

alter table incident_timeline enable row level security;
create policy "service_role_all_incident_timeline" on incident_timeline for all using (true) with check (true);

create index idx_timeline_incident on incident_timeline(incident_id);
create index idx_timeline_type on incident_timeline(entry_type);
create index idx_timeline_created on incident_timeline(created_at);

alter publication supabase_realtime add table incident_timeline;
