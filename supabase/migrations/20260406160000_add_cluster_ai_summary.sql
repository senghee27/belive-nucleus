-- ============================================
-- Migration: Add AI summary + top items to cluster_health_cache
-- Author: BeLive Nucleus
-- Date: 2026-04-06
-- ============================================

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  ai_summary text;

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  ai_summary_generated_at timestamptz;

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  top_blockers jsonb DEFAULT '[]';

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  top_maintenance jsonb DEFAULT '[]';

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  top_cleaning jsonb DEFAULT '[]';

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  top_movein jsonb DEFAULT '[]';

ALTER TABLE cluster_health_cache ADD COLUMN IF NOT EXISTS
  top_moveout jsonb DEFAULT '[]';
