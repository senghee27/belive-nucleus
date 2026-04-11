-- ============================================================
-- War Room — incident fields for /clusters redesign
-- Adds the three fields the war-room situation-report rows need:
--
--   situation_summary  one-line AI summary (≤140 chars) generated
--                      during classification. Named distinctly from
--                      the existing ai_summary column (which holds a
--                      2-3 sentence timeline summary generated on-
--                      demand by generateSummary()). The spec's
--                      "ai_summary" maps to this column.
--
--   is_classified      true once classifyMessage has successfully
--                      produced a structured classification.
--                      Drives the amber "[unclassified]" fallback
--                      state on war-room rows.
--
--   raw_lark_text      preserved raw text from the triggering Lark
--                      message. Used by the unclassified-fallback
--                      render to show the tenant's original voice.
--                      Mirrors raw_content at creation time but is
--                      kept separately so downstream writes to
--                      raw_content cannot destroy the fallback.
-- ============================================================

ALTER TABLE incidents
  ADD COLUMN IF NOT EXISTS situation_summary text,
  ADD COLUMN IF NOT EXISTS is_classified    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS raw_lark_text    text;

-- Length guard for the one-liner — matches the spec's ≤140 char budget.
ALTER TABLE incidents
  DROP CONSTRAINT IF EXISTS situation_summary_length;
ALTER TABLE incidents
  ADD CONSTRAINT situation_summary_length
  CHECK (situation_summary IS NULL OR char_length(situation_summary) <= 140);

-- Backfill is_classified = true for incidents that already have
-- an ai_proposal (they went through classification successfully at
-- some point). This lets the war-room view render them as normal
-- rows instead of as amber "[unclassified]" fallbacks.
UPDATE incidents
   SET is_classified = true
 WHERE ai_proposal IS NOT NULL
   AND is_classified = false;

-- Backfill raw_lark_text from raw_content for existing rows so the
-- unclassified-fallback path has something to render if one of
-- these rows flips back to unclassified.
UPDATE incidents
   SET raw_lark_text = raw_content
 WHERE raw_lark_text IS NULL;

-- Partial index for the war-room "unclassified" fast-path query
-- (amber rows surface at the top of each column).
CREATE INDEX IF NOT EXISTS idx_incidents_unclassified
  ON incidents(cluster, created_at DESC)
  WHERE is_classified = false;
