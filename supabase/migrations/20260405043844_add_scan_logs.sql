-- ============================================
-- Migration: Add scan logs table
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists scan_logs (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  trigger_type text not null,
  trigger_source text,
  cluster text,
  chat_id text,
  group_name text,
  messages_found int default 0,
  new_messages int default 0,
  issues_detected int default 0,
  status text default 'success',
  error_message text,
  duration_ms int,
  details jsonb
);

alter table scan_logs enable row level security;

create policy "service_role_all_scan_logs" on scan_logs
  for all using (true) with check (true);

create index if not exists idx_scan_logs_created_at on scan_logs(created_at);
create index if not exists idx_scan_logs_cluster on scan_logs(cluster);

alter publication supabase_realtime add table scan_logs;
