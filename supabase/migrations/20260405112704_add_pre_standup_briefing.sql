-- ============================================
-- Migration: Pre-Standup Briefing System
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- 1. Standup sessions table
create table if not exists standup_sessions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  session_date date not null,
  cluster text not null,
  chat_id text not null,
  brief_sent boolean default false,
  brief_sent_at timestamptz,
  brief_card_json jsonb,
  brief_lark_message_id text,
  report_detected boolean default false,
  report_detected_at timestamptz,
  report_raw_content text,
  report_sender_name text,
  report_sender_open_id text,
  report_confidence int,
  report_extracted jsonb,
  compliance_status text default 'pending',
  reminder_sent boolean default false,
  reminder_sent_at timestamptz,
  reminder_lark_message_id text,
  incident_id uuid references incidents(id),
  midday_scanned boolean default false,
  midday_scanned_at timestamptz,
  midday_summary text,
  midday_new_incidents int default 0,
  midday_commitments_on_track boolean,
  occ_sent boolean default false,
  occ_sent_at timestamptz,
  occ_card_json jsonb,
  occ_lark_message_id text,
  unique(session_date, cluster)
);

create trigger set_updated_at_standup_sessions
  before update on standup_sessions
  for each row execute function update_updated_at();

alter table standup_sessions enable row level security;
create policy "service_role_all_standup_sessions" on standup_sessions for all using (true) with check (true);

create index idx_standup_date on standup_sessions(session_date);
create index idx_standup_cluster on standup_sessions(cluster);
create index idx_standup_compliance on standup_sessions(compliance_status);

alter publication supabase_realtime add table standup_sessions;

-- 2. Daily messages table
create table if not exists daily_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  session_id uuid references standup_sessions(id),
  cluster text not null,
  session_date date not null,
  message_type text not null,
  direction text not null,
  content_text text,
  content_card_json jsonb,
  sender_name text,
  lark_message_id text,
  sent_at timestamptz,
  metadata jsonb
);

alter table daily_messages enable row level security;
create policy "service_role_all_daily_messages" on daily_messages for all using (true) with check (true);

create index idx_daily_msg_session on daily_messages(session_id);
create index idx_daily_msg_cluster_date on daily_messages(cluster, session_date);

alter publication supabase_realtime add table daily_messages;

-- 3. Add compliance columns to cluster_health_cache
alter table cluster_health_cache
  add column if not exists today_compliance text default 'pending',
  add column if not exists standup_report_at timestamptz,
  add column if not exists brief_sent_today boolean default false,
  add column if not exists occ_sent_today boolean default false;

-- 4. Add Sales Bookings + Tenant Viewing to monitored_groups
insert into monitored_groups (chat_id, group_name, cluster, cluster_color, location, group_type, context, agent, scanning_enabled)
values
('oc_f81ecc82a89ffebed07ff3c5025be54d', 'Sales Bookings', 'ALL', '#E8A838', 'All Clusters', 'sales', 'Daily sales report. Total = Indoor Sales + Outdoor Own Sales ONLY. Indoor numbers ALREADY include virtual sales — never add on top. Outdoor Physical From Viewing = already in indoor. External Agent + Uhomes = tracked only, excluded from total.', 'cfo', true),
('oc_6f826a841c23872ce8faa8e16f822f6a', 'Tenant Viewing', 'ALL', '#4BB8F2', 'All Clusters', 'sales', 'Daily viewing counts per agent. Secondary sales signal.', 'cfo', true)
on conflict (chat_id) do nothing;
