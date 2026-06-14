-- Student Terms & Conditions acceptance tracking (idempotent).
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_students_terms_accepted
  ON public.students (terms_accepted)
  WHERE terms_accepted = false;
