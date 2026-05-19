-- Faculty portal study materials (standalone catalog, not subject-linked).

CREATE TABLE IF NOT EXISTS public.faculty_study_materials (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT '',
  grade_level VARCHAR(128),
  file_name VARCHAR(512),
  file_url VARCHAR(512),
  file_type VARCHAR(64),
  file_size BIGINT,
  uploaded_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_faculty_study_materials_uploaded_by
  ON public.faculty_study_materials (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_faculty_study_materials_grade_level
  ON public.faculty_study_materials (grade_level);
