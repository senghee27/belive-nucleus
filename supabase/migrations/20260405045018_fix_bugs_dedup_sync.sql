-- ============================================
-- Migration: Fix bugs — dedup issues, sync decisions-issues
-- Author: BeLive Nucleus
-- Date: 2026-04-05
-- ============================================

-- BUG 1: Add unique constraint on source_message_id to prevent duplicate issues
-- First drop any existing duplicates (keep oldest)
delete from lark_issues a using lark_issues b
  where a.id > b.id
  and a.source_message_id = b.source_message_id
  and a.source_message_id is not null;

create unique index if not exists idx_lark_issues_source_msg_unique
  on lark_issues(source_message_id)
  where source_message_id is not null;

-- BUG 4: Add lark_issue_id to decisions table for linking
alter table decisions add column if not exists lark_issue_id uuid references lark_issues(id);
create index if not exists idx_decisions_lark_issue_id on decisions(lark_issue_id);
