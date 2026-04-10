-- ============================================
-- Migration: Proposal Learning Engine
-- Author: BeLive Nucleus
-- Date: 2026-04-10
-- ============================================

-- 1. proposal_revisions — every version of every AI proposal + Lee's feedback
CREATE TABLE IF NOT EXISTS proposal_revisions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  version_number integer NOT NULL DEFAULT 1,

  -- Proposal content
  proposal_text text NOT NULL,
  ai_confidence integer,

  -- Lee's feedback (null for the final/approved version)
  feedback_text text,
  feedback_tags text[] DEFAULT '{}',

  -- State
  is_final boolean DEFAULT false,
  outcome text CHECK (outcome IN ('approved', 'edited', 'discarded', 'pending')),

  -- AI generation metadata
  ai_prompt_tokens integer,
  ai_completion_tokens integer,
  past_feedback_injected boolean DEFAULT false,

  -- Timestamps
  created_at timestamptz DEFAULT now(),
  decided_at timestamptz,

  UNIQUE(incident_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_proposal_revisions_incident ON proposal_revisions(incident_id);
CREATE INDEX IF NOT EXISTS idx_proposal_revisions_outcome ON proposal_revisions(outcome);
CREATE INDEX IF NOT EXISTS idx_proposal_revisions_created ON proposal_revisions(created_at DESC);

ALTER TABLE proposal_revisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON proposal_revisions
  FOR ALL USING (true) WITH CHECK (true);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE proposal_revisions;

-- 2. category_learning_stats — materialized stats per category
CREATE TABLE IF NOT EXISTS category_learning_stats (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  category text NOT NULL UNIQUE,

  -- Counts
  total_proposals integer DEFAULT 0,
  approved_v1 integer DEFAULT 0,
  approved_edited integer DEFAULT 0,
  discarded integer DEFAULT 0,

  -- Computed rates
  acceptance_rate numeric(5,2) DEFAULT 0,
  edit_rate numeric(5,2) DEFAULT 0,

  -- Autonomy tracking
  last_20_outcomes text[] DEFAULT '{}',
  consecutive_approvals integer DEFAULT 0,
  auto_send_eligible boolean DEFAULT false,
  auto_send_enabled boolean DEFAULT false,

  -- Top correction tags
  top_tags jsonb DEFAULT '[]',

  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_category_learning_stats_category ON category_learning_stats(category);

ALTER TABLE category_learning_stats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON category_learning_stats
  FOR ALL USING (true) WITH CHECK (true);

CREATE TRIGGER set_category_learning_stats_updated_at
  BEFORE UPDATE ON category_learning_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 3. Extend incidents table with revision tracking
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS current_version integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_revisions integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS proposal_outcome text,
  ADD COLUMN IF NOT EXISTS proposal_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS feedback_tags_accumulated text[] DEFAULT '{}';

-- Add constraint on proposal_outcome values (if not already)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'incidents_proposal_outcome_check'
  ) THEN
    ALTER TABLE incidents
      ADD CONSTRAINT incidents_proposal_outcome_check
      CHECK (proposal_outcome IS NULL OR proposal_outcome IN ('approved', 'edited', 'discarded', 'pending'));
  END IF;
END$$;
