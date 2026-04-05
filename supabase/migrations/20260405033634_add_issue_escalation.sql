-- ============================================
-- Migration: Add issue escalation fields
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- Add columns to lark_issues
alter table lark_issues add column if not exists priority text default 'P3';
alter table lark_issues add column if not exists escalation_due_at timestamptz;
alter table lark_issues add column if not exists escalated boolean default false;
alter table lark_issues add column if not exists follow_up_count int default 0;
alter table lark_issues add column if not exists last_follow_up_at timestamptz;
alter table lark_issues add column if not exists resolved_at timestamptz;
alter table lark_issues add column if not exists resolved_by text;
alter table lark_issues add column if not exists cluster_color text;

create index if not exists idx_lark_issues_priority on lark_issues(priority);
create index if not exists idx_lark_issues_escalated on lark_issues(escalated);
create index if not exists idx_lark_issues_escalation_due on lark_issues(escalation_due_at);

-- Issue follow-ups table
create table if not exists issue_follow_ups (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  issue_id uuid references lark_issues(id),
  follow_up_type text,
  message_sent text,
  sent_to_chat_id text,
  response_received boolean default false,
  response_at timestamptz
);

alter table issue_follow_ups enable row level security;

create policy "service_role_all_issue_follow_ups" on issue_follow_ups
  for all using (true)
  with check (true);

create index if not exists idx_issue_follow_ups_issue_id on issue_follow_ups(issue_id);
