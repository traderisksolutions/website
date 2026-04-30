-- Run in Supabase SQL Editor after outbound_schema.sql

CREATE TABLE IF NOT EXISTS outbound_schedules (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz DEFAULT now(),
  query         text NOT NULL,
  roles         text[] DEFAULT '{"CEO","CTO","Founder"}',
  max_companies int  DEFAULT 8,
  frequency     text DEFAULT 'daily' CHECK (frequency IN ('daily', 'weekly')),
  is_active     bool DEFAULT true,
  last_run_at   timestamptz,
  next_run_at   timestamptz,
  runs_count    int DEFAULT 0,
  leads_last    int DEFAULT 0
);

CREATE INDEX IF NOT EXISTS outbound_schedules_active_idx ON outbound_schedules(is_active, next_run_at);
