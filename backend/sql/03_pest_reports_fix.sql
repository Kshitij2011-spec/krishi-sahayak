-- ============================================================
-- backend/sql/03_pest_reports_fix.sql
-- Migration: fix pest_reports schema + anon INSERT policy
--
-- Pre-flight confirmed (2026-09-08):
--   - pest_reports EXISTS with 0 rows
--   - Missing columns: crop, disease, confidence_tier, severity
--   - RLS is ON; anon SELECT works; anon INSERT blocked (401)
--
-- SAFE: uses ADD COLUMN IF NOT EXISTS + idempotent DO $$ block
-- Does NOT modify or delete any existing data.
-- Run once in: Supabase Dashboard → SQL Editor
-- ============================================================

-- STEP 1: Add the 4 missing columns
-- ADD COLUMN IF NOT EXISTS is supported since PostgreSQL 9.6+
-- Supabase runs PostgreSQL 15+; this is safe.
ALTER TABLE pest_reports
  ADD COLUMN IF NOT EXISTS crop             TEXT,
  ADD COLUMN IF NOT EXISTS disease          TEXT,
  ADD COLUMN IF NOT EXISTS confidence_tier  TEXT,
  ADD COLUMN IF NOT EXISTS severity         TEXT;

-- STEP 2: Add anon INSERT policy
-- NOTE: CREATE POLICY IF NOT EXISTS is PostgreSQL 17+ only.
-- Supabase runs PostgreSQL 15, so we use a DO $$ block to check first.
-- The DO block is idempotent: safe to run multiple times.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_policies
    WHERE  schemaname = 'public'
      AND  tablename  = 'pest_reports'
      AND  policyname = 'anon_insert_pest_reports'
  ) THEN
    EXECUTE '
      CREATE POLICY anon_insert_pest_reports
        ON pest_reports
        FOR INSERT
        TO anon
        WITH CHECK (true)
    ';
    RAISE NOTICE 'Policy anon_insert_pest_reports created.';
  ELSE
    RAISE NOTICE 'Policy anon_insert_pest_reports already exists — skipped.';
  END IF;
END $$;

-- STEP 3: Verify (informational — check output in SQL editor)
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name   = 'pest_reports'
ORDER BY ordinal_position;
