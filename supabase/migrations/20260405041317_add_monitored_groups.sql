-- ============================================
-- Migration: Add monitored groups table
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists monitored_groups (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  chat_id text unique not null,
  group_name text not null,
  cluster text not null,
  cluster_color text default '#F2784B',
  location text,
  group_type text default 'cluster',
  context text,
  agent text default 'coo',
  scanning_enabled boolean default true,
  scan_frequency_minutes int default 60,
  last_scanned_at timestamptz,
  message_count_total int default 0,
  issue_count_total int default 0,
  active_issues int default 0,
  added_by text default 'Lee Seng Hee',
  notes text
);

create trigger set_updated_at_monitored_groups
  before update on monitored_groups
  for each row execute function update_updated_at();

alter table monitored_groups enable row level security;

create policy "service_role_all_monitored_groups" on monitored_groups
  for all using (true) with check (true);

create index if not exists idx_monitored_groups_cluster on monitored_groups(cluster);
create index if not exists idx_monitored_groups_scanning on monitored_groups(scanning_enabled);
create index if not exists idx_monitored_groups_chat_id on monitored_groups(chat_id);

alter publication supabase_realtime add table monitored_groups;

-- Seed all 11 clusters
insert into monitored_groups (chat_id, group_name, cluster, cluster_color, location, group_type, context, agent) values
('oc_d1444b3f367192219a0a60b4dfb7fecb', 'Cluster 1 — JB', 'C1', '#F2784B', 'Johor Bahru, Johor', 'cluster', 'Covers EPIC (286 units), Bayu Angkasa, Bora Residence, Medini Signature, Austin Regency, Marina Residence. IOE: Nureen. OOE: Syuib. Tech: Ali. OR: Nicholas+Elsie. Total: 403 units.', 'coo'),
('oc_2592d0368e35fce2a5712c95e446ec17', 'Cluster 2 — Penang', 'C2', '#9B6DFF', 'Batu Kawan, Penang', 'cluster', 'Covers Vertu Resort (139), Vivo (70), Sinaran, Fairview, Utropolis, Rubica. IOE: Intan. OOE: Izram+Safie. Tech: Faiq. OR: Izzul+Herman. Total: 239 units.', 'coo'),
('oc_8557892a71694977e646d0750286b532', 'Cluster 3 — Nilai', 'C3', '#4BB8F2', 'Nilai, Salak Perdana, Sepang', 'cluster', 'Covers Youth City Vision City (54), Acacia Residence (130). IOE: Aireen. OOE: Amin+Safie. Tech: Ayad. OR: Mimi+Reen. Total: 184 units.', 'coo'),
('oc_23f4b9516f13fcdd9d049660bf3c2851', 'Cluster 4 — Ampang', 'C4', '#4BF2A2', 'Jalan Ampang, Setapak, Wangsa Maju', 'cluster', 'Covers Astoria Ampang (75), Platinum Splendor (112), MH Platinum 2 (61), M Adora (23), Sunway Avila (8), Neu Suites (8). IOE: Aliya+Nureen. Tech: Danial. OR: Izzul+Herman. Total: 287 units.', 'coo'),
('oc_6d9d83b2c73ab20a168a3cc78de68994', 'Cluster 5 — Ara Damansara', 'C5', '#E8A838', 'Ara Damansara', 'cluster', 'Covers Perla Ara Sentral (6), AraTre Residences (173), 121 Residence (16). IOE: Aliya. OOE: Johan. Tech: Airul. OR: Mimi+Reen. Total: 195 units.', 'coo'),
('oc_c7c2b5e1a8728f527ca618f5b644c934', 'Cluster 6 — PJ Subang', 'C6', '#F27BAD', 'Petaling Jaya, Subang Jaya', 'cluster', 'Covers Azure Residence (97), Emporis (102), HighPark (52), Armani Soho (21), Sapphire (10), Sunway Serene (4), Icon City (6). IOE: Intan. OOE: Johan+Asyraf. Tech: Hariz. OR: Mimi+Reen. Total: 292 units.', 'coo'),
('oc_97eb2eebfc235bd180afceafe5a9c514', 'Cluster 7 — Seri Kembangan', 'C7', '#6DD5F2', 'Seri Kembangan', 'cluster', 'Covers Meta City (273), 7 Tree Seven (19), The Netizen (4). IOE: Mardhiah+Aireen. OOE: Asyraf+Syuib. Tech: Ayad. OR: Mimi+Reen. Total: 296 units.', 'coo'),
('oc_ace6312bfd7317550940ed001f04a92f', 'Cluster 8 — Sentul', 'C8', '#B46DF2', 'Sentul, Jalan Ipoh', 'cluster', 'Covers Rica Residence (117), The Birch (49), Unio Residence (89), Duta Park (19). IOE: Mardhiah. OOE: Zowie. Tech: Airul+Danial. OR: Izzul+Herman. Total: 274 units.', 'coo'),
('oc_e59ce72f6864572d10d68462d856aad9', 'Cluster 9 — Cheras South', 'C9', '#F2C96D', 'Sg Besi, Cheras, Cochrane', 'cluster', 'Covers Arte Cheras (50), Razak City (52), The PARC3 (50), The Ooak (37), Majestic Maxim (11), Trion (5). IOE: Intan+Aliya. OOE: Safie+Johan. Tech: Faris. OR: Nicholas+Elsie. Total: 170 units.', 'coo'),
('oc_75e4c47ca8e8e1e57a0b39e90d80e105', 'Cluster 10 — Mont Kiara', 'C10', '#6DF2B4', 'Mont Kiara, Bukit Jalil, Brickfields', 'cluster', 'Covers The Andes (70), Secoya (15), Pixel City (9), The Riv (9), Harmony (8), Riamas (7), Inwood (3). IOE: Nureen+Aliya. OOE: Zowie+Asyraf. Tech: Danial+Hariz. OR: Izzul+Herman. Total: 159 units.', 'coo'),
('oc_269af941aba2403693dd5dad8a45e832', 'Cluster 11 — M Vertica', 'C11', '#E05252', 'Cheras — M Vertica', 'cluster', 'Covers M Vertica Residence (385 units). IOE: Airen+Mardhiah. OOE: Safie+Johan. Tech: Faris. OR: Nicholas+Elsie. OM: Fatihah. Largest single property. Total: 385 units.', 'coo');
