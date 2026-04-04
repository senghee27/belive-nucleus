# Skill: Supabase Migrations

## How to Create a Migration
```bash
supabase migration new description_of_change
```
This creates: supabase/migrations/TIMESTAMP_description.sql

## Migration File Template
```sql
-- ============================================
-- Migration: [description]
-- Author: BeLive Nucleus
-- Date: [date]
-- ============================================

-- 1. Tables
create table if not exists table_name (
  id uuid default gen_random_uuid() primary key,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 2. Updated_at trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at
  before update on table_name
  for each row execute function update_updated_at();

-- 3. RLS
alter table table_name enable row level security;

create policy "service_role_all" on table_name
  for all using (true)
  with check (true);

-- 4. Indexes
create index if not exists idx_table_column
  on table_name(column_name);

-- 5. Realtime (if needed)
alter publication supabase_realtime add table table_name;
```

## Apply Migration Locally
```bash
supabase db reset
```

## Push to Staging
```bash
supabase link --project-ref STAGING_REF
supabase db push
```

## Rules
- Never edit existing migration files
- Always use create table if not exists
- Always add RLS
- Always add updated_at trigger
- Always add indexes on foreign keys and filter columns
