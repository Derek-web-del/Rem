-- Fix failed PDF constraint bootstrap: purge non-PDF rows, then ensure constraint exists.

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
