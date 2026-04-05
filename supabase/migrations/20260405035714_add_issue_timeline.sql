-- ============================================
-- Migration: Add issue timeline and thread intelligence
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- 1. Issue timeline entries
create table if not exists issue_timeline_entries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  issue_id uuid references lark_issues(id) on delete cascade,
  entry_type text not null,
  sender_name text,
  sender_open_id text,
  content text not null,
  lark_message_id text,
  metadata jsonb,
  is_lee boolean default false
);

alter table issue_timeline_entries enable row level security;

create policy "service_role_all_issue_timeline" on issue_timeline_entries
  for all using (true)
  with check (true);

create index if not exists idx_timeline_issue_id on issue_timeline_entries(issue_id);
create index if not exists idx_timeline_entry_type on issue_timeline_entries(entry_type);
create index if not exists idx_timeline_created_at on issue_timeline_entries(created_at);

alter publication supabase_realtime add table issue_timeline_entries;

-- 2. Add columns to lark_issues
alter table lark_issues add column if not exists thread_keywords text[];
alter table lark_issues add column if not exists last_message_at timestamptz;
alter table lark_issues add column if not exists silence_hours numeric;
alter table lark_issues add column if not exists ai_summary text;
alter table lark_issues add column if not exists ai_summary_at timestamptz;
alter table lark_issues add column if not exists message_count int default 0;
alter table lark_issues add column if not exists has_lee_replied boolean default false;
