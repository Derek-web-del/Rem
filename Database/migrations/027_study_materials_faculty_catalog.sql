-- Consolidate faculty Study Materials catalog into public.study_materials.
-- Migrates rows from faculty_study_materials, then drops the duplicate table.

ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS grade_level VARCHAR(128),
  ADD COLUMN IF NOT EXISTS subject VARCHAR(128),
  ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(64),
  ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Faculty catalog entries are not always linked to a subjects row.
ALTER TABLE public.study_materials
  ALTER COLUMN subject_id DROP NOT NULL;

ALTER TABLE public.study_materials
  ALTER COLUMN unit_no SET DEFAULT '1';

CREATE INDEX IF NOT EXISTS idx_study_materials_uploaded_by
  ON public.study_materials (uploaded_by);

CREATE INDEX IF NOT EXISTS idx_study_materials_grade_level
  ON public.study_materials (grade_level);

CREATE INDEX IF NOT EXISTS idx_study_materials_subject
  ON public.study_materials (subject);

-- Copy existing faculty catalog rows (dedupe by file_url + uploaded_by).
INSERT INTO public.study_materials (
  material_name,
  grade_level,
  subject,
  file_name,
  file_url,
  file_type,
  file_size,
  uploaded_by,
  uploaded_by_name,
  created_at,
  updated_at,
  unit_no
)
SELECT
  fsm.title,
  fsm.grade_level,
  fsm.subject,
  fsm.file_name,
  fsm.file_url,
  fsm.file_type,
  fsm.file_size,
  fsm.uploaded_by,
  fsm.uploaded_by_name,
  fsm.created_at,
  fsm.updated_at,
  '1'
FROM public.faculty_study_materials fsm
WHERE fsm.file_url IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.study_materials sm
    WHERE sm.file_url = fsm.file_url
      AND sm.uploaded_by::text = fsm.uploaded_by::text
  );

-- PDF-only constraint (matches faculty catalog rules).
DELETE FROM public.study_materials
WHERE uploaded_by IS NOT NULL
  AND file_type IS NOT NULL
  AND upper(trim(file_type)) <> 'PDF';

UPDATE public.study_materials
SET file_type = 'PDF'
WHERE uploaded_by IS NOT NULL AND file_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_study_materials_file_type_pdf'
  ) THEN
    ALTER TABLE public.study_materials
      ADD CONSTRAINT chk_study_materials_file_type_pdf
      CHECK (
        uploaded_by IS NULL
        OR file_type IS NULL
        OR file_type = 'PDF'
      );
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DROP TABLE IF EXISTS public.faculty_study_materials;
