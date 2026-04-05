-- ============================================
-- Migration: Command Center War Room columns
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

alter table incidents add column if not exists category text default 'other';
create index if not exists idx_incidents_category on incidents(category);
create index if not exists idx_incidents_status_created on incidents(status, created_at desc);
