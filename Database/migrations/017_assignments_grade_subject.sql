-- Store assignment subject name and grade level directly on assignments.

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS subject_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_assignments_grade_level ON public.assignments (grade_level);
CREATE INDEX IF NOT EXISTS idx_assignments_subject_name ON public.assignments (subject_name);
