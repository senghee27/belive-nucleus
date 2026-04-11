-- ============================================================
-- AI Situation Line — core of the Tickets-mode war-room row.
--
-- ai_report_tickets.issue_description holds raw human text parsed
-- from Livability Reports, which often reads like meta-commentary
-- ("This is an overdue normal priority maintenance request") —
-- the current failure mode the spec's §3.1 calls out explicitly.
--
-- ai_situation_line is a Claude-generated distilled line in the
-- shape `{what is broken, where} · {blocker or state}`, ≤12 words,
-- with a mandatory "no update" fallback when the ticket's data
-- has no blocker info. See lib/tickets/situation-line.ts for the
-- generator.
--
-- ai_situation_generated_at lets the generator decide whether a
-- ticket's line needs regeneration on upsert (re-run only when
-- issue_description / summary / status / age has changed).
-- ============================================================

ALTER TABLE ai_report_tickets
  ADD COLUMN IF NOT EXISTS ai_situation_line text,
  ADD COLUMN IF NOT EXISTS ai_situation_generated_at timestamptz;

-- Length guard — 12 words is roughly 80 chars at max density.
-- Generous ceiling of 160 chars lets the odd long-word ticket slip
-- through, but the generator will still aim for ~80.
ALTER TABLE ai_report_tickets
  DROP CONSTRAINT IF EXISTS ai_situation_line_length;
ALTER TABLE ai_report_tickets
  ADD CONSTRAINT ai_situation_line_length
  CHECK (ai_situation_line IS NULL OR char_length(ai_situation_line) <= 160);

-- Partial index — Tickets mode reads WHERE status='open'; having
-- a secondary order on ai_situation_line being NULL vs NOT NULL
-- helps the backfill target rows that still need generation.
CREATE INDEX IF NOT EXISTS idx_ai_report_tickets_needs_generation
  ON ai_report_tickets(status, cluster)
  WHERE status = 'open' AND ai_situation_line IS NULL;
