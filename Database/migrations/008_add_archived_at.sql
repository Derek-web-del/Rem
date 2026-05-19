-- Soft-archive timestamp for 1-year retention policy (students + faculties).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

ALTER TABLE public.faculties
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_students_archived_at
  ON public.students (archived_at)
  WHERE archived_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_faculties_archived_at
  ON public.faculties (archived_at)
  WHERE archived_at IS NOT NULL;
