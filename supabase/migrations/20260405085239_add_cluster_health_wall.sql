-- ============================================
-- Migration: Cluster Health Wall
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists cluster_health_cache (
  id uuid default gen_random_uuid() primary key,
  updated_at timestamptz default now(),
  cluster text unique not null,
  cluster_name text not null,
  chat_id text not null,
  health_status text default 'green',
  health_score int default 100,
  maintenance_total int default 0,
  maintenance_overdue int default 0,
  maintenance_active int default 0,
  maintenance_silent int default 0,
  maintenance_max_age_days numeric default 0,
  cleaning_total int default 0,
  cleaning_overdue int default 0,
  cleaning_active int default 0,
  cleaning_silent int default 0,
  cleaning_max_age_days numeric default 0,
  move_in_pending int default 0,
  move_in_overdue int default 0,
  turnaround_total int default 0,
  turnaround_warning int default 0,
  turnaround_breach int default 0,
  turnaround_max_days numeric default 0,
  last_cluster_message_at timestamptz,
  cluster_silent_hours numeric default 0,
  last_computed_at timestamptz default now()
);

alter table cluster_health_cache enable row level security;
create policy "service_role_all_cluster_health" on cluster_health_cache for all using (true) with check (true);
alter publication supabase_realtime add table cluster_health_cache;

-- Seed all 11 clusters
insert into cluster_health_cache (cluster, cluster_name, chat_id) values
('C1', 'Johor Bahru', 'oc_d1444b3f367192219a0a60b4dfb7fecb'),
('C2', 'Penang', 'oc_2592d0368e35fce2a5712c95e446ec17'),
('C3', 'Nilai', 'oc_8557892a71694977e646d0750286b532'),
('C4', 'Ampang', 'oc_23f4b9516f13fcdd9d049660bf3c2851'),
('C5', 'Ara Damansara', 'oc_6d9d83b2c73ab20a168a3cc78de68994'),
('C6', 'PJ Subang', 'oc_c7c2b5e1a8728f527ca618f5b644c934'),
('C7', 'Seri Kembangan', 'oc_97eb2eebfc235bd180afceafe5a9c514'),
('C8', 'Sentul', 'oc_ace6312bfd7317550940ed001f04a92f'),
('C9', 'Cheras', 'oc_e59ce72f6864572d10d68462d856aad9'),
('C10', 'Mont Kiara', 'oc_75e4c47ca8e8e1e57a0b39e90d80e105'),
('C11', 'M Vertica', 'oc_269af941aba2403693dd5dad8a45e832')
on conflict (cluster) do nothing;
