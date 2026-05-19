-- OWASP A04/A08: track who last modified institute records
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255);

ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.faculties
  ADD COLUMN IF NOT EXISTS last_modified_by VARCHAR(255);

ALTER TABLE public.faculties
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
