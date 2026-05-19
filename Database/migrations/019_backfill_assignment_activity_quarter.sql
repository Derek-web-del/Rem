-- Backfill null quarter and subject_id on assignments and activities.

UPDATE public.activities SET quarter = 1 WHERE quarter IS NULL;
UPDATE public.assignments SET quarter = 1 WHERE quarter IS NULL;

UPDATE public.activities a
SET subject_id = s.id
FROM public.subjects s
WHERE lower(trim(s.subject_name)) = lower(trim(a.subject_name))
  AND a.subject_id IS NULL
  AND (
    a.grade_level IS NULL
    OR trim(a.grade_level) = ''
    OR lower(trim(s.grade_level)) = lower(trim(a.grade_level))
  );

UPDATE public.assignments a
SET subject_id = s.id
FROM public.subjects s
WHERE lower(trim(s.subject_name)) = lower(trim(a.subject_name))
  AND a.subject_id IS NULL
  AND (
    a.grade_level IS NULL
    OR trim(a.grade_level) = ''
    OR lower(trim(s.grade_level)) = lower(trim(a.grade_level))
  );
