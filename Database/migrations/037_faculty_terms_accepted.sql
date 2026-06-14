-- Faculty Terms & Conditions acceptance (idempotent).
ALTER TABLE public.faculties
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.faculties
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL;

CREATE INDEX IF NOT EXISTS idx_faculties_terms_accepted
  ON public.faculties (terms_accepted)
  WHERE terms_accepted = false;
