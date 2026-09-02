-- backend/sql/02_officer_requests.sql
-- Phase 7: Farmer → Agriculture Officer Request System
--
-- Run this in your Supabase SQL editor.
-- pest_reports.id is SERIAL (integer) so report_id is integer nullable.
-- Do NOT modify pest_reports or extension_feedback.

CREATE TABLE IF NOT EXISTS officer_requests (
    id                      SERIAL PRIMARY KEY,
    reference_code          TEXT NOT NULL UNIQUE,        -- opaque KR-XXXXXX shown to farmer
    report_id               INTEGER REFERENCES pest_reports(id),  -- nullable: request may come without a detection report
    crop                    TEXT,
    disease                 TEXT,
    confidence_score        NUMERIC,
    confidence_tier         TEXT CHECK (confidence_tier IN ('high', 'medium', 'low', NULL)),
    severity                TEXT,
    district                TEXT,
    latitude                NUMERIC,
    longitude               NUMERIC,
    location_is_approximate BOOLEAN DEFAULT TRUE,
    farmer_message          TEXT NOT NULL,
    status                  TEXT NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'in_review', 'responded', 'closed')),
    officer_notes           TEXT,
    officer_id              TEXT,
    created_at              TIMESTAMPTZ DEFAULT NOW(),
    updated_at              TIMESTAMPTZ DEFAULT NOW(),
    reviewed_at             TIMESTAMPTZ
);

-- Index for fast reference_code lookup (farmer status page)
CREATE INDEX IF NOT EXISTS idx_officer_requests_reference_code
    ON officer_requests (reference_code);

-- Index for status-based officer dashboard queries
CREATE INDEX IF NOT EXISTS idx_officer_requests_status
    ON officer_requests (status, created_at DESC);

-- Trigger to auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_officer_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_officer_requests_updated_at ON officer_requests;
CREATE TRIGGER trg_officer_requests_updated_at
    BEFORE UPDATE ON officer_requests
    FOR EACH ROW EXECUTE FUNCTION update_officer_requests_updated_at();
