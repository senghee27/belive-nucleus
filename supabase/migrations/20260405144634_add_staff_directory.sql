-- ============================================
-- Migration: Staff Directory
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

create table if not exists staff_directory (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  open_id text unique not null,
  lark_user_id text,
  name text not null,
  first_name text,
  email text,
  phone text,
  role text,
  cluster text,
  department text,
  avatar_url text,
  employee_code text,
  is_active boolean default true,
  last_synced_at timestamptz
);

create trigger set_updated_at_staff_directory
  before update on staff_directory
  for each row execute function update_updated_at();

alter table staff_directory enable row level security;
create policy "service_role_all_staff_directory" on staff_directory for all using (true) with check (true);

create index idx_staff_open_id on staff_directory(open_id);
create index idx_staff_role on staff_directory(role);
create index idx_staff_cluster on staff_directory(cluster);

-- Also add source_lark_message_id to incidents if not exists
-- (needed for thread reply anchoring)
alter table incidents add column if not exists source_lark_message_id text;
