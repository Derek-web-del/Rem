-- Dr. Kirk panel: archive student/faculty accounts must record a reason.
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS archive_reason TEXT;
ALTER TABLE public.faculties ADD COLUMN IF NOT EXISTS archive_reason TEXT;
