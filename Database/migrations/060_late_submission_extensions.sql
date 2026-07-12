-- Per-student late submission extensions (admin-granted).

ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS late_submission_until TIMESTAMPTZ;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS late_submission_reason TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_by TEXT;
ALTER TABLE public.assignment_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_at TIMESTAMPTZ;

ALTER TABLE public.activity_submissions ADD COLUMN IF NOT EXISTS late_submission_until TIMESTAMPTZ;
ALTER TABLE public.activity_submissions ADD COLUMN IF NOT EXISTS late_submission_reason TEXT;
ALTER TABLE public.activity_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_by TEXT;
ALTER TABLE public.activity_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_at TIMESTAMPTZ;

ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS late_submission_until TIMESTAMPTZ;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS late_submission_reason TEXT;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_by TEXT;
ALTER TABLE public.quiz_submissions ADD COLUMN IF NOT EXISTS late_submission_granted_at TIMESTAMPTZ;
