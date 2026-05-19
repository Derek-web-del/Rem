-- Faculty study materials: PDF-only, subject tag, uploader display name.

ALTER TABLE public.faculty_study_materials
  ADD COLUMN IF NOT EXISTS subject VARCHAR(128);

ALTER TABLE public.faculty_study_materials
  ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255);

-- Remove legacy non-PDF rows before enforcing PDF-only constraint.
DELETE FROM public.faculty_study_materials
WHERE file_type IS NOT NULL AND upper(trim(file_type)) <> 'PDF';

UPDATE public.faculty_study_materials
SET file_type = 'PDF'
WHERE file_type IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_faculty_study_materials_file_type_pdf'
  ) THEN
    ALTER TABLE public.faculty_study_materials
      ADD CONSTRAINT chk_faculty_study_materials_file_type_pdf
      CHECK (file_type IS NULL OR file_type = 'PDF');
  END IF;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_faculty_study_materials_subject
  ON public.faculty_study_materials (subject);
