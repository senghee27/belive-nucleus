-- ============================================
-- Migration: Briefing Reports & Auto-Send Config
-- Author: BeLive Nucleus
-- Date: 2026-04-06
-- ============================================

-- 1. briefing_reports table
CREATE TABLE IF NOT EXISTS briefing_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),

  -- Identity
  report_type text NOT NULL,
  report_name text NOT NULL,
  cluster text,
  scheduled_for timestamptz,
  generated_at timestamptz,

  -- Content
  content text NOT NULL,
  content_original text NOT NULL,

  -- Generation metadata
  generation_log jsonb DEFAULT '{}',

  -- Send destinations
  destinations jsonb NOT NULL DEFAULT '[]',

  -- Status lifecycle: draft → pending_review → approved → sent | failed | discarded
  status text NOT NULL DEFAULT 'draft',

  -- Lee actions
  lee_edited boolean DEFAULT false,
  lee_approved_at timestamptz,
  sent_at timestamptz,
  sent_to jsonb,
  send_error text,

  -- Auto-send tracking
  was_auto_sent boolean DEFAULT false
);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_briefing_reports_updated_at
  BEFORE UPDATE ON briefing_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- RLS
ALTER TABLE briefing_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON briefing_reports
  FOR ALL USING (true) WITH CHECK (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_briefing_reports_type_created
  ON briefing_reports(report_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_briefing_reports_status
  ON briefing_reports(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_briefing_reports_cluster
  ON briefing_reports(cluster, created_at DESC)
  WHERE cluster IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_briefing_reports_scheduled
  ON briefing_reports(scheduled_for DESC);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE briefing_reports;

-- 2. briefing_autosend_config table
CREATE TABLE IF NOT EXISTS briefing_autosend_config (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  updated_at timestamptz DEFAULT now(),

  report_type text NOT NULL UNIQUE,
  auto_send_enabled boolean DEFAULT false,

  -- Confidence tracking
  consecutive_approvals int DEFAULT 0,
  total_approvals int DEFAULT 0,
  total_reviews int DEFAULT 0,
  approval_rate int DEFAULT 0,
  last_approved_at timestamptz,
  last_sent_at timestamptz,

  -- Gate thresholds
  required_consecutive_approvals int DEFAULT 10,

  -- Unlock status
  auto_send_eligible boolean DEFAULT false
);

CREATE TRIGGER set_briefing_autosend_config_updated_at
  BEFORE UPDATE ON briefing_autosend_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE briefing_autosend_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON briefing_autosend_config
  FOR ALL USING (true) WITH CHECK (true);

-- Seed with all report types
INSERT INTO briefing_autosend_config (report_type) VALUES
  ('MORNING_BRIEF'),
  ('MIDDAY_PULSE'),
  ('EOD_SUMMARY'),
  ('STANDUP_BRIEF'),
  ('COMPLIANCE_ALERT'),
  ('WEEKLY_OPS'),
  ('MONTHLY_REPORT'),
  ('OWNER_SATISFACTION'),
  ('CLUSTER_SNAPSHOT'),
  ('INCIDENT_SUMMARY'),
  ('SALES_SNAPSHOT')
ON CONFLICT (report_type) DO NOTHING;
