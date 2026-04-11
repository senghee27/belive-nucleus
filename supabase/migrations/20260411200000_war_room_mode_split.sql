-- ============================================================
-- War Room Mode Split — attention_required column
--
-- Adds the column that Command mode of /clusters filters on.
-- The spec's "Reasoning Trace attention step" doesn't exist as a
-- dedicated 7th reasoning step yet — this column is populated by
-- a heuristic during classification (see lib/incidents.ts
-- createIncident) and by this backfill for existing rows.
--
-- Heuristic: an incident needs Lee's attention when any of:
--   - priority = 'P1'
--   - !is_classified  (LLM hasn't produced a structured result)
--   - min_reasoning_confidence < 70  (low-confidence classification)
--   - escalated = true  (already breached SLA and auto-escalated)
--
-- A proper 7th reasoning step can replace the heuristic later by
-- writing directly to this column. No schema change needed when
-- that happens — the column is the stable interface.
-- ============================================================

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS attention_required boolean NOT NULL DEFAULT false;

-- Partial index — Command mode's primary query filters on this.
-- Scoped to "attention true AND no linked ticket" because Command
-- mode also dedups against the ticketing pipeline (see the API
-- route at app/api/clusters/war-room/route.ts).
CREATE INDEX IF NOT EXISTS idx_incidents_attention
  ON incidents(cluster, priority, created_at DESC)
  WHERE attention_required = true AND ticket_id IS NULL;

-- Backfill using the same heuristic the classification pipeline
-- will use going forward. Touches every incident but only flips
-- the ones that match — safe to re-run.
UPDATE incidents
   SET attention_required = true
 WHERE attention_required = false
   AND (
     priority = 'P1'
     OR is_classified = false
     OR COALESCE(min_reasoning_confidence, 100) < 70
     OR escalated = true
   );
