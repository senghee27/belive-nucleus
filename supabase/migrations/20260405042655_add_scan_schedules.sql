-- ============================================
-- Migration: Add scan schedules table
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists scan_schedules (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  name text not null,
  description text,
  agent text default 'coo',
  group_ids uuid[] not null default '{}',
  enabled boolean default true,
  frequency text not null default 'daily',
  days_of_week int[],
  time_myt text,
  timezone text default 'Asia/Kuala_Lumpur',
  skill text default 'general_scan',
  custom_prompt text,
  output_actions text[] default ARRAY['detect_issues'],
  last_run_at timestamptz,
  last_run_status text,
  last_run_summary text,
  total_runs int default 0,
  next_run_at timestamptz
);

create trigger set_updated_at_scan_schedules
  before update on scan_schedules
  for each row execute function update_updated_at();

alter table scan_schedules enable row level security;

create policy "service_role_all_scan_schedules" on scan_schedules
  for all using (true) with check (true);

create index if not exists idx_scan_schedules_enabled on scan_schedules(enabled);
create index if not exists idx_scan_schedules_next_run on scan_schedules(next_run_at);

alter publication supabase_realtime add table scan_schedules;

-- Seed standard schedules (group_ids empty — user assigns via UI)
insert into scan_schedules
(name, description, agent, frequency, days_of_week, time_myt, skill, custom_prompt, output_actions, group_ids) values
('Morning Ops Briefing',
 'Daily morning intelligence for cluster groups',
 'coo', 'daily', ARRAY[1,2,3,4,5,6], '08:30',
 'morning_briefing',
 'Focus on: overnight issues, pending maintenance, rooms stuck in turnaround pipeline, tenants waiting for updates. Always name the specific PIC responsible. Keep it under 200 words per cluster. End with 2 priorities for today.',
 ARRAY['detect_issues', 'send_briefing', 'dm_lee_summary'],
 '{}'),
('Midday Check',
 'Midday scan to catch new issues and check morning follow-ups',
 'coo', 'daily', ARRAY[1,2,3,4,5,6], '12:00',
 'issue_detection',
 'Check if morning issues have been resolved. Flag anything unresolved from morning. Look for new issues. Check if team responded to Lee instructions.',
 ARRAY['detect_issues', 'update_issue_tracker', 'dm_lee_summary'],
 '{}'),
('OCC Nightly Review',
 'Deep operational review with 50/50 praise and accountability',
 'coo', 'daily', ARRAY[1,2,3,4,5,6], '22:15',
 'occ_nightly',
 'Follow the 50/50 rule: first half acknowledges good behaviors specifically (name the person, name the behavior), second half questions gaps with root cause thinking. Evidence-based. Vary structure each night.',
 ARRAY['send_briefing', 'dm_lee_summary'],
 '{}');
