-- Study materials linked to subjects (teacher read-only viewer).

CREATE TABLE IF NOT EXISTS study_materials (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  unit_no VARCHAR(32) NOT NULL DEFAULT '1',
  unit_name VARCHAR(255),
  material_name VARCHAR(255),
  file_url TEXT,
  file_type VARCHAR(64),
  file_name VARCHAR(512),
  file_size BIGINT,
  quarter VARCHAR(16),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_materials_subject_id ON study_materials (subject_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_unit_no ON study_materials (subject_id, unit_no);
