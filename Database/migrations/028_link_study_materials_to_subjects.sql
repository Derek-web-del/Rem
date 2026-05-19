-- Link faculty catalog rows in study_materials to subjects; backfill missing titles.

UPDATE public.study_materials sm
SET subject_id = s.id
FROM public.subjects s
WHERE sm.subject_id IS NULL
  AND sm.uploaded_by IS NOT NULL
  AND sm.uploaded_by::text = s.faculty_id::text
  AND (
    (COALESCE(TRIM(sm.subject), '') <> '' AND sm.subject IN (s.subject_code, s.subject_name))
    OR (
      COALESCE(TRIM(sm.grade_level), '') <> ''
      AND sm.grade_level = s.grade_level
      AND (
        COALESCE(TRIM(sm.subject), '') = ''
        OR sm.subject IN (s.subject_code, s.subject_name)
      )
    )
  );

UPDATE public.study_materials
SET material_name = COALESCE(
  NULLIF(TRIM(material_name), ''),
  NULLIF(TRIM(file_name), ''),
  'Untitled Material'
)
WHERE COALESCE(TRIM(material_name), '') = '';

UPDATE public.subject_materials
SET material_name = COALESCE(
  NULLIF(TRIM(material_name), ''),
  NULLIF(TRIM(unit_name), ''),
  NULLIF(TRIM(file_name), ''),
  'Untitled Material'
)
WHERE COALESCE(TRIM(material_name), '') = '';
