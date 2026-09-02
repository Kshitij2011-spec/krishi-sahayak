-- backend/sql/01_pest_reports.sql
CREATE TABLE pest_reports (
    id SERIAL PRIMARY KEY,
    image_url TEXT,
    predicted_label VARCHAR(100),
    confidence_score FLOAT,
    trap_count INT,
    crop_stage VARCHAR(50),
    latitude FLOAT,
    longitude FLOAT,
    district VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE extension_feedback (
    id SERIAL PRIMARY KEY,
    report_id INT REFERENCES pest_reports(id),
    officer_id VARCHAR(50),
    is_verified BOOLEAN,
    verified_label VARCHAR(100),
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
