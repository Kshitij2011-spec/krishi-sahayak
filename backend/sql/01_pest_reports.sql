-- backend/sql/01_pest_reports.sql
-- Canonical schema for pest_reports + extension_feedback.
-- Reflects actual production state after 03_pest_reports_fix.sql migration.
--
-- RLS: anon key may INSERT (detection page) and SELECT (dashboard).
--      Service-role key used by backend officer_requests routes (bypasses RLS).

CREATE TABLE IF NOT EXISTS pest_reports (
    id               SERIAL PRIMARY KEY,
    image_url        TEXT,
    predicted_label  VARCHAR(100),
    confidence_score FLOAT,
    confidence_tier  TEXT,             -- 'high' | 'medium' | 'low'
    severity         TEXT,             -- 'None' | 'Low' | 'Medium' | 'High' | 'Unknown'
    crop             TEXT,             -- crop name from detection or farmer selection
    disease          TEXT,             -- parsed disease name from model label
    trap_count       INT,
    crop_stage       VARCHAR(50),
    latitude         FLOAT,
    longitude        FLOAT,
    district         VARCHAR(100),
    created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- RLS: enable and allow anon INSERT (detection from frontend) + SELECT (dashboard)
ALTER TABLE pest_reports ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pest_reports'
      AND policyname = 'anon_insert_pest_reports'
  ) THEN
    EXECUTE 'CREATE POLICY anon_insert_pest_reports ON pest_reports FOR INSERT TO anon WITH CHECK (true)';
  END IF;
END $$;

-- extension_feedback: officer verification of reports
CREATE TABLE IF NOT EXISTS extension_feedback (
    id             SERIAL PRIMARY KEY,
    report_id      INT REFERENCES pest_reports(id),
    officer_id     VARCHAR(50),
    is_verified    BOOLEAN,
    verified_label VARCHAR(100),
    notes          TEXT,
    created_at     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
