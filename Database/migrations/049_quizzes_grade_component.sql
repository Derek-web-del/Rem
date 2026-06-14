-- Link quizzes to subjects and grading criteria (gradebook parity with assignments/activities).

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS grade_component_id BIGINT
  REFERENCES public.subject_grade_components(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quizzes_subject_grade_component
  ON public.quizzes (subject_id, grade_component_id);

-- Backfill subject_id from subject name + grade level where missing.
UPDATE public.quizzes q
SET subject_id = s.id
FROM public.subjects s
WHERE q.subject_id IS NULL
  AND lower(trim(coalesce(q.subject, ''))) = lower(trim(coalesce(s.subject_name, '')))
  AND lower(trim(replace(coalesce(q.grade_level, ''), '  ', ' ')))
    = lower(trim(replace(coalesce(s.grade_level, ''), '  ', ' ')));

-- Assign quizzes to the subject's is_quiz grading component when unset.
UPDATE public.quizzes q
SET grade_component_id = gc.id
FROM public.subject_grade_components gc
WHERE q.subject_id = gc.subject_id
  AND gc.is_quiz = true
  AND q.grade_component_id IS NULL
  AND gc.id = (
    SELECT gc2.id
    FROM public.subject_grade_components gc2
    WHERE gc2.subject_id = q.subject_id AND gc2.is_quiz = true
    ORDER BY gc2.component_order ASC, gc2.id ASC
    LIMIT 1
  );
