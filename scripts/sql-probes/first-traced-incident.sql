-- first-traced-incident.sql
-- One-shot dump of the earliest incident that went through the reasoning
-- trace pipeline: its core row + all 6 incident_reasoning_traces rows
-- side-by-side for QC / post-deploy verification.
--
-- Usage: paste into the Supabase SQL editor for project itvvsdcwwibntitwtqaa
-- (belive-nucleus production) and run. No parameters.

WITH first_traced AS (
  SELECT id
    FROM incidents
   WHERE min_reasoning_confidence IS NOT NULL
   ORDER BY created_at ASC
   LIMIT 1
)
SELECT
  'INCIDENT' AS row_kind,
  i.id::text AS key,
  i.title,
  i.cluster,
  i.category,
  i.priority,
  i.status,
  i.assigned_to,
  i.min_reasoning_confidence,
  i.merge_count,
  i.lark_root_id,
  NULL::int  AS step_order,
  NULL::text AS step_name,
  NULL::int  AS confidence,
  NULL::text AS decision,
  NULL::text AS reasoning_text,
  NULL::text AS generated_by
FROM incidents i
JOIN first_traced ft ON ft.id = i.id

UNION ALL

SELECT
  'TRACE' AS row_kind,
  t.id::text AS key,
  NULL AS title,
  NULL AS cluster,
  NULL AS category,
  NULL AS priority,
  NULL AS status,
  NULL AS assigned_to,
  NULL AS min_reasoning_confidence,
  NULL AS merge_count,
  NULL AS lark_root_id,
  t.step_order,
  t.step_name,
  t.confidence,
  t.decision,
  t.reasoning_text,
  t.generated_by
FROM incident_reasoning_traces t
JOIN first_traced ft ON ft.id = t.incident_id

ORDER BY row_kind DESC, step_order ASC NULLS FIRST;
