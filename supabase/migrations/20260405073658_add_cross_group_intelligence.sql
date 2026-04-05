-- ============================================
-- Migration: Cross-Group Intelligence
-- AI Report parsing, function groups, ticket tracking
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- 1. Add function groups to monitored_groups
insert into monitored_groups (chat_id, group_name, cluster, cluster_color, location, group_type, context, agent, scanning_enabled)
values
('oc_a4addada959faf09e220364d4fabae75', 'BeLive AI Report Group', 'ALL', '#F2784B', 'All Clusters', 'ai_report', 'Master Livability Report — automated daily report of all unresolved maintenance and ops tickets. Format: BLV-RQ-XXXXXXXX ticket IDs with age, SLA, owner, unit, issue, summary. Ground truth for what is officially broken.', 'coo', true),
('oc_84d477b9a5549e78204e40c57f35a391', 'IOE Group', 'ALL', '#9B6DFF', 'All Clusters', 'function', 'Indoor Operation Executive cross-cluster group. Fatihah (OM) coordinates all IOEs. SOP updates, case ownership, cross-cluster support.', 'ceo', true),
('oc_c62dd3068938b127be3496615d03ffe3', 'OOE Group', 'ALL', '#4BB8F2', 'All Clusters', 'function', 'Outdoor Operation Executive cross-cluster group. Adam (OOE Lead) coordinates. Turnaround coordination, resource allocation.', 'coo', true),
('oc_d7862fe1757a516a7c8c66dfd7a36d2b', 'Maintenance + RPM Group', 'ALL', '#4BF2A2', 'All Clusters', 'function', 'Maintenance technician and RPM cross-cluster group. Fariha (Maintenance Manager) coordinates. Parts procurement, tech support, SOP updates.', 'coo', true)
on conflict (chat_id) do nothing;

-- 2. AI Report Tickets table
create table if not exists ai_report_tickets (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  report_date date not null,
  ticket_id text not null,
  ticket_number int,
  age_days numeric,
  sla_date date,
  sla_overdue boolean default false,
  owner_role text,
  owner_name text,
  property text,
  cluster text,
  unit_number text,
  room text,
  issue_description text,
  summary text,
  status text default 'open',
  incident_id uuid references incidents(id),
  cluster_activity_detected boolean default false,
  last_cluster_message_at timestamptz,
  source_lark_message_id text,
  unique(ticket_id, report_date)
);

create trigger set_updated_at_ai_report_tickets
  before update on ai_report_tickets
  for each row execute function update_updated_at();

alter table ai_report_tickets enable row level security;
create policy "service_role_all_ai_report_tickets" on ai_report_tickets for all using (true) with check (true);

create index idx_ai_tickets_ticket_id on ai_report_tickets(ticket_id);
create index idx_ai_tickets_cluster on ai_report_tickets(cluster);
create index idx_ai_tickets_status on ai_report_tickets(status);
create index idx_ai_tickets_sla on ai_report_tickets(sla_overdue);
create index idx_ai_tickets_report_date on ai_report_tickets(report_date);

-- 3. Add columns to incidents table
alter table incidents add column if not exists incident_type text default 'reactive';
alter table incidents add column if not exists ticket_id text;
alter table incidents add column if not exists ticket_age_days numeric;
alter table incidents add column if not exists sla_date date;
alter table incidents add column if not exists sla_overdue boolean default false;
alter table incidents add column if not exists ticket_owner_name text;
alter table incidents add column if not exists ticket_owner_role text;
