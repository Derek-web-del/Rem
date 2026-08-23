-- Links a plagiarism report back to the submission it was run against, so the
-- "Check Plagiarism" action on a submission can be traced to a specific
-- student/assignment/activity instead of being an anonymous standalone check.

ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS submission_id BIGINT;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS student_id VARCHAR(64);
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS assignment_id BIGINT;
ALTER TABLE public.plagiarism_reports ADD COLUMN IF NOT EXISTS activity_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_submission
  ON public.plagiarism_reports (submission_id) WHERE submission_id IS NOT NULL;
