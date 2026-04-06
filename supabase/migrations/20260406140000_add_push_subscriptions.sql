-- ============================================
-- Migration: Push Subscriptions
-- Author: BeLive Nucleus
-- Date: 2026-04-06
-- ============================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz DEFAULT now(),
  user_id text NOT NULL DEFAULT 'lee',
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL,
  device_name text,
  last_used_at timestamptz,
  active boolean DEFAULT true
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON push_subscriptions
  FOR ALL USING (true) WITH CHECK (true);
