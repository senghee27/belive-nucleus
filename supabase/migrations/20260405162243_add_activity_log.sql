-- ============================================
-- Migration: Nucleus Activity Log (Watchdog)
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists nucleus_activity_log (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  event_type text not null,
  event_subtype text,
  cluster text,
  group_name text,
  chat_id text,
  summary text not null,
  detail jsonb,
  incident_id uuid references incidents(id),
  lark_message_id text,
  success boolean default true,
  error_message text,
  expires_at timestamptz default (now() + interval '30 days')
);

alter table nucleus_activity_log enable row level security;
create policy "service_role_all_activity_log" on nucleus_activity_log for all using (true) with check (true);

create index idx_activity_log_created on nucleus_activity_log(created_at desc);
create index idx_activity_log_event_type on nucleus_activity_log(event_type, created_at desc);
create index idx_activity_log_cluster on nucleus_activity_log(cluster, created_at desc);
create index idx_activity_log_incident on nucleus_activity_log(incident_id) where incident_id is not null;

alter publication supabase_realtime add table nucleus_activity_log;
