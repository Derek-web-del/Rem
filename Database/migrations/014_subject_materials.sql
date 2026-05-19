-- Faculty study materials (subject_materials) — canonical store for uploaded materials.

CREATE TABLE IF NOT EXISTS subject_materials (
  id SERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  unit_no INT NOT NULL DEFAULT 1,
  unit_name VARCHAR(255),
  material_name VARCHAR(255),
  subject_quarter VARCHAR(16),
  subject_name VARCHAR(255),
  grade_level VARCHAR(128),
  file_path TEXT NOT NULL,
  file_name VARCHAR(512),
  file_size BIGINT,
  file_type VARCHAR(64),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_materials_subject_id ON subject_materials (subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_materials_subject_unit ON subject_materials (subject_id, unit_no);

-- Backfill from legacy study_materials when present.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'study_materials'
  ) THEN
    INSERT INTO subject_materials (
      subject_id,
      unit_no,
      unit_name,
      material_name,
      subject_quarter,
      subject_name,
      grade_level,
      file_path,
      file_name,
      file_size,
      file_type,
      created_at,
      updated_at
    )
    SELECT
      sm.subject_id,
      CASE
        WHEN sm.unit_no ~ '^[0-9]+$' THEN sm.unit_no::int
        ELSE 1
      END,
      sm.unit_name,
      COALESCE(sm.material_name, sm.unit_name),
      sm.quarter,
      s.subject_name,
      s.grade_level,
      sm.file_url,
      sm.file_name,
      sm.file_size,
      sm.file_type,
      COALESCE(sm.created_at, NOW()),
      COALESCE(sm.created_at, NOW())
    FROM study_materials sm
    INNER JOIN subjects s ON s.id = sm.subject_id
    WHERE COALESCE(TRIM(sm.file_url), '') <> ''
      AND NOT EXISTS (
        SELECT 1 FROM subject_materials m
        WHERE m.subject_id = sm.subject_id
          AND m.file_path = sm.file_url
          AND COALESCE(m.material_name, '') = COALESCE(sm.material_name, sm.unit_name, '')
      );
  END IF;
END $$;

-- Ensure columns exist if table was created earlier with a partial schema.
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS unit_name VARCHAR(255);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS material_name VARCHAR(255);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_quarter VARCHAR(16);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS subject_name VARCHAR(255);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_path TEXT;
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_name VARCHAR(512);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS file_type VARCHAR(64);
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE subject_materials ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
