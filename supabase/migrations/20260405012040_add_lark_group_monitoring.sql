-- ============================================
-- Migration: Add Lark group monitoring tables
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- Tables: lark_tokens, lark_group_messages, lark_issues
-- ============================================

-- 1. LARK_TOKENS TABLE
create table if not exists lark_tokens (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  token_type text not null,
  app_id text not null,
  token_value text not null,
  expires_at timestamptz,
  user_open_id text,
  is_active boolean default true
);

create trigger set_updated_at_lark_tokens
  before update on lark_tokens
  for each row execute function update_updated_at();

alter table lark_tokens enable row level security;

create policy "service_role_all_lark_tokens" on lark_tokens
  for all using (true)
  with check (true);

create index if not exists idx_lark_tokens_type_active on lark_tokens(token_type, is_active);

-- 2. LARK_GROUP_MESSAGES TABLE
create table if not exists lark_group_messages (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  cluster text not null,
  chat_id text not null,
  message_id text unique not null,
  sender_name text,
  sender_open_id text,
  content text,
  message_time timestamptz,
  processed boolean default false,
  issue_detected boolean default false,
  decision_id uuid references decisions(id)
);

alter table lark_group_messages enable row level security;

create policy "service_role_all_lark_group_messages" on lark_group_messages
  for all using (true)
  with check (true);

create index if not exists idx_lark_group_messages_cluster on lark_group_messages(cluster);
create index if not exists idx_lark_group_messages_chat_id on lark_group_messages(chat_id);
create index if not exists idx_lark_group_messages_message_id on lark_group_messages(message_id);
create index if not exists idx_lark_group_messages_processed on lark_group_messages(processed);

-- 3. LARK_ISSUES TABLE
create table if not exists lark_issues (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  cluster text not null,
  chat_id text not null,
  title text not null,
  severity text default 'YELLOW',
  status text default 'open',
  owner_name text,
  owner_open_id text,
  last_activity timestamptz,
  days_open int default 0,
  source_message_id text,
  decision_id uuid references decisions(id),
  notes text
);

create trigger set_updated_at_lark_issues
  before update on lark_issues
  for each row execute function update_updated_at();

alter table lark_issues enable row level security;

create policy "service_role_all_lark_issues" on lark_issues
  for all using (true)
  with check (true);

create index if not exists idx_lark_issues_cluster on lark_issues(cluster);
create index if not exists idx_lark_issues_chat_id on lark_issues(chat_id);
create index if not exists idx_lark_issues_status on lark_issues(status);
create index if not exists idx_lark_issues_severity on lark_issues(severity);

-- 4. REALTIME
alter publication supabase_realtime add table lark_group_messages;
alter publication supabase_realtime add table lark_issues;
