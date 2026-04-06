-- ============================================
-- Migration: Briefing Cron Runs & Schedule Config
-- Author: BeLive Nucleus
-- Date: 2026-04-06
-- ============================================

-- 1. briefing_cron_runs table
CREATE TABLE IF NOT EXISTS briefing_cron_runs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),

  -- Identity
  report_type text NOT NULL,
  cluster text,

  -- Trigger
  triggered_by text NOT NULL DEFAULT 'cron',
  triggered_by_user text,

  -- Timing
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  duration_seconds int,

  -- Outcome
  status text NOT NULL DEFAULT 'running',
  error_message text,
  retry_count int DEFAULT 0,

  -- Output
  report_id uuid REFERENCES briefing_reports(id),

  -- Data sources
  sources_attempted jsonb DEFAULT '[]',
  sources_succeeded jsonb DEFAULT '[]',
  sources_failed jsonb DEFAULT '[]',

  -- AI usage
  tokens_used int,
  model text,

  -- Skip reason
  skip_reason text
);

CREATE TRIGGER set_briefing_cron_runs_updated_at
  BEFORE UPDATE ON briefing_cron_runs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE briefing_cron_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON briefing_cron_runs
  FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_cron_runs_type_started
  ON briefing_cron_runs(report_type, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_runs_cluster_started
  ON briefing_cron_runs(cluster, started_at DESC)
  WHERE cluster IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_cron_runs_status
  ON briefing_cron_runs(status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_cron_runs_started
  ON briefing_cron_runs(started_at DESC);

ALTER PUBLICATION supabase_realtime ADD TABLE briefing_cron_runs;

-- 2. briefing_schedule_config table
CREATE TABLE IF NOT EXISTS briefing_schedule_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at timestamptz DEFAULT now(),

  report_type text NOT NULL UNIQUE,
  report_name text NOT NULL,
  report_icon text NOT NULL,
  category text NOT NULL,

  -- Schedule
  enabled boolean DEFAULT true,
  cron_expression text,
  schedule_description text,
  timezone text DEFAULT 'Asia/Kuala_Lumpur',

  -- Per-cluster flag
  is_per_cluster boolean DEFAULT false,

  -- Default destinations
  default_destinations jsonb DEFAULT '[]',

  -- Stats
  last_run_at timestamptz,
  last_run_status text,
  last_report_id uuid REFERENCES briefing_reports(id),
  next_run_at timestamptz,
  total_runs int DEFAULT 0,
  successful_runs int DEFAULT 0,
  failed_runs int DEFAULT 0,
  success_rate int DEFAULT 0
);

CREATE TRIGGER set_briefing_schedule_config_updated_at
  BEFORE UPDATE ON briefing_schedule_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE briefing_schedule_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON briefing_schedule_config
  FOR ALL USING (true) WITH CHECK (true);

-- Seed all report types
INSERT INTO briefing_schedule_config
(report_type, report_name, report_icon, category,
 cron_expression, schedule_description, is_per_cluster,
 default_destinations) VALUES

('MORNING_BRIEF', 'Morning Intelligence Briefing', '🌅', 'daily',
 '30 0 * * 1-6', 'Daily 8:30am MYT Mon–Sat', false,
 '[{"chat_id":"oc_a4addada959faf09e220364d4fabae75","name":"AI Report Group","type":"ai_report","selected":true},{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('MIDDAY_PULSE', 'Midday Pulse', '☀️', 'daily',
 '30 4 * * 1-6', 'Daily 12:30pm MYT Mon–Sat', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('EOD_SUMMARY', 'End of Day Summary', '🌙', 'daily',
 '30 10 * * 1-6', 'Daily 6:30pm MYT Mon–Sat', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('STANDUP_BRIEF', 'Pre-Standup Brief', '📋', 'cluster',
 '0 0 * * 1-6', 'Daily 8:00am MYT Mon–Sat × 11 clusters', true,
 '[]'),

('COMPLIANCE_ALERT', 'Compliance Alert', '⚠️', 'cluster',
 null, 'On trigger (no standup by 10:00am)', true, '[]'),

('WEEKLY_OPS', 'Weekly Operations Review', '📊', 'management',
 '0 1 * * 1', 'Every Monday 9:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('MONTHLY_REPORT', 'Monthly Performance Report', '📅', 'management',
 '0 1 1 * *', '1st of each month 9:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('OWNER_SATISFACTION', 'Owner Satisfaction Summary', '🏠', 'management',
 '0 2 * * 1', 'Every Monday 10:00am MYT', false,
 '[{"chat_id":"ou_af2a40628719440234aa29656d06d322","name":"Lee DM","type":"lee_dm","selected":true}]'),

('CLUSTER_SNAPSHOT', 'Cluster Snapshot', '🔍', 'on_demand',
 null, 'Manual trigger', true, '[]'),

('INCIDENT_SUMMARY', 'Incident Summary Report', '⚡', 'on_demand',
 null, 'Manual trigger', false, '[]'),

('SALES_SNAPSHOT', 'Sales Performance Snapshot', '💰', 'on_demand',
 null, 'Manual trigger', false, '[]')

ON CONFLICT (report_type) DO NOTHING;
