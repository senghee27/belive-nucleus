-- ============================================================
-- Reasoning Trace + Backend Upgrade
-- Adds: per-step reasoning trace table, derived min confidence
-- column, structured assigned_to column, lark_root_id column
-- (required by the matcher's strongest signal), and reasoning-
-- level Learning Engine feedback column.
-- ============================================================

-- 0. lark_root_id on incidents (required by findMatchingIncident
--    signal cascade; not present in earlier migrations).
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS lark_root_id text;

CREATE INDEX IF NOT EXISTS idx_incidents_lark_root_id
  ON incidents(lark_root_id)
  WHERE lark_root_id IS NOT NULL;

-- 1. Per-step reasoning trace
CREATE TABLE IF NOT EXISTS incident_reasoning_traces (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  incident_id uuid NOT NULL REFERENCES incidents(id) ON DELETE CASCADE,
  step_name text NOT NULL CHECK (step_name IN (
    'matching', 'is_incident', 'classification', 'priority', 'routing', 'voice_fit'
  )),
  step_order smallint NOT NULL,

  decision text,
  decision_detail jsonb DEFAULT '{}'::jsonb,

  confidence integer NOT NULL CHECK (confidence BETWEEN 0 AND 100),

  reasoning_text text NOT NULL,
  narrative_text text,
  narrative_generated_at timestamptz,

  model_version text,
  generated_by text CHECK (generated_by IN ('deterministic', 'llm')),
  input_signal jsonb DEFAULT '{}'::jsonb,

  created_at timestamptz DEFAULT now(),

  UNIQUE(incident_id, step_name)
);

CREATE INDEX IF NOT EXISTS idx_reasoning_incident
  ON incident_reasoning_traces(incident_id);
CREATE INDEX IF NOT EXISTS idx_reasoning_low_conf
  ON incident_reasoning_traces(confidence)
  WHERE confidence < 70;
CREATE INDEX IF NOT EXISTS idx_reasoning_step_conf
  ON incident_reasoning_traces(step_name, confidence);
CREATE INDEX IF NOT EXISTS idx_reasoning_created
  ON incident_reasoning_traces(created_at DESC);

-- 2. Derived fields on incidents
ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS min_reasoning_confidence integer,
  ADD COLUMN IF NOT EXISTS assigned_to text,
  ADD COLUMN IF NOT EXISTS merged_from_incident_id uuid REFERENCES incidents(id),
  ADD COLUMN IF NOT EXISTS merge_count integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_incidents_min_reasoning
  ON incidents(min_reasoning_confidence)
  WHERE min_reasoning_confidence IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_incidents_assigned_to
  ON incidents(assigned_to)
  WHERE assigned_to IS NOT NULL;

-- 3. Trigger: recompute min_reasoning_confidence on trace insert/update
CREATE OR REPLACE FUNCTION recompute_min_reasoning_confidence()
RETURNS trigger AS $$
BEGIN
  UPDATE incidents
    SET min_reasoning_confidence = (
      SELECT MIN(confidence)
        FROM incident_reasoning_traces
       WHERE incident_id = NEW.incident_id
    )
    WHERE id = NEW.incident_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_recompute_min_conf ON incident_reasoning_traces;
CREATE TRIGGER trg_recompute_min_conf
  AFTER INSERT OR UPDATE OF confidence ON incident_reasoning_traces
  FOR EACH ROW EXECUTE FUNCTION recompute_min_reasoning_confidence();

-- 4. Learning Engine: reasoning-step feedback (separate from proposal-level)
ALTER TABLE proposal_revisions
  ADD COLUMN IF NOT EXISTS reasoning_feedback_tags text[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_revisions_reasoning_feedback
  ON proposal_revisions USING gin(reasoning_feedback_tags)
  WHERE array_length(reasoning_feedback_tags, 1) > 0;

-- 5. RLS
ALTER TABLE incident_reasoning_traces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_all" ON incident_reasoning_traces;
CREATE POLICY "service_role_all" ON incident_reasoning_traces
  FOR ALL USING (true) WITH CHECK (true);

-- 6. Seed: known PICs (referenced by routing step)
CREATE TABLE IF NOT EXISTS routing_pics (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text UNIQUE NOT NULL,
  role text NOT NULL,
  default_categories text[] DEFAULT '{}',
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

INSERT INTO routing_pics (name, role, default_categories) VALUES
  ('Fatihah', 'Operations Manager', ARRAY['onboarding', 'move_in', 'move_out', 'access_card']),
  ('Fariha',  'Maintenance Lead',   ARRAY['air_con', 'plumbing', 'electrical', 'lift', 'door_lock', 'water_heater', 'general_repair', 'structural']),
  ('Adam',    'OOE Lead',           ARRAY['safety', 'eviction', 'complaint']),
  ('Linda',   'Owner Relations',    ARRAY['payment', 'complaint']),
  ('David',   'Housekeeping',       ARRAY['cleaning', 'hygiene', 'pest'])
ON CONFLICT (name) DO NOTHING;

ALTER TABLE routing_pics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_all" ON routing_pics;
CREATE POLICY "service_role_all" ON routing_pics FOR ALL USING (true) WITH CHECK (true);
