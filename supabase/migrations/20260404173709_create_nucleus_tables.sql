-- ============================================
-- Migration: Create Nucleus core tables
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- Tables: events, decisions, agent_memory, agent_skills
-- ============================================

-- 0. Updated_at trigger function (shared by all tables)
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================
-- 1. EVENTS TABLE
-- ============================================
create table if not exists events (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  source text not null,
  source_id text,
  source_type text,
  sender_name text,
  sender_id text,
  chat_id text,
  chat_name text,
  content text not null,
  raw_payload jsonb,
  processed boolean default false
);

create trigger set_updated_at_events
  before update on events
  for each row execute function update_updated_at();

alter table events enable row level security;

create policy "service_role_all_events" on events
  for all using (true)
  with check (true);

create index if not exists idx_events_source on events(source);
create index if not exists idx_events_processed on events(processed);
create index if not exists idx_events_created_at on events(created_at);
create index if not exists idx_events_chat_id on events(chat_id);

-- ============================================
-- 2. DECISIONS TABLE
-- ============================================
create table if not exists decisions (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  event_id uuid references events(id),
  source text,
  agent text,
  problem_type text,
  priority text default 'P3',
  ai_summary text,
  ai_proposal text,
  ai_reasoning text,
  ai_confidence int default 0,
  status text default 'pending',
  lee_edit text,
  final_reply text,
  auto_executed boolean default false,
  sent_at timestamptz,
  outcome text
);

create trigger set_updated_at_decisions
  before update on decisions
  for each row execute function update_updated_at();

alter table decisions enable row level security;

create policy "service_role_all_decisions" on decisions
  for all using (true)
  with check (true);

create index if not exists idx_decisions_event_id on decisions(event_id);
create index if not exists idx_decisions_status on decisions(status);
create index if not exists idx_decisions_priority on decisions(priority);
create index if not exists idx_decisions_agent on decisions(agent);
create index if not exists idx_decisions_created_at on decisions(created_at);

-- ============================================
-- 3. AGENT_MEMORY TABLE
-- ============================================
create table if not exists agent_memory (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  agent text not null,
  problem_type text not null,
  pattern_summary text,
  approval_rate int default 0,
  total_decisions int default 0,
  approved_count int default 0,
  autonomous boolean default false,
  unique (agent, problem_type)
);

create trigger set_updated_at_agent_memory
  before update on agent_memory
  for each row execute function update_updated_at();

alter table agent_memory enable row level security;

create policy "service_role_all_agent_memory" on agent_memory
  for all using (true)
  with check (true);

create index if not exists idx_agent_memory_agent on agent_memory(agent);
create index if not exists idx_agent_memory_autonomous on agent_memory(autonomous);

-- ============================================
-- 4. AGENT_SKILLS TABLE
-- ============================================
create table if not exists agent_skills (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  agent text not null,
  skill_name text not null,
  skill_prompt text,
  active boolean default true
);

alter table agent_skills enable row level security;

create policy "service_role_all_agent_skills" on agent_skills
  for all using (true)
  with check (true);

create index if not exists idx_agent_skills_agent on agent_skills(agent);
create index if not exists idx_agent_skills_active on agent_skills(active);

-- ============================================
-- 5. REALTIME
-- ============================================
alter publication supabase_realtime add table events;
alter publication supabase_realtime add table decisions;

-- ============================================
-- 6. SEED DATA — Agent Memory
-- ============================================
insert into agent_memory (agent, problem_type, pattern_summary) values
  ('coo', 'ops_maintenance', 'Learning...'),
  ('coo', 'ops_tenant_complaint', 'Learning...'),
  ('coo', 'ops_emergency', 'Learning...'),
  ('cfo', 'finance_payout', 'Learning...'),
  ('cfo', 'finance_dispute', 'Learning...'),
  ('ceo', 'owner_relationship', 'Learning...'),
  ('ceo', 'people_escalation', 'Learning...'),
  ('cto', 'tech_bug', 'Learning...'),
  ('cto', 'tech_feature', 'Learning...');
