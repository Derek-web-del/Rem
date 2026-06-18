-- Allow student hard-delete (archive auto-purge) to cascade into quiz submissions.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_quiz_submissions_student'
  ) THEN
    ALTER TABLE public.quiz_submissions DROP CONSTRAINT fk_quiz_submissions_student;
  END IF;

  ALTER TABLE public.quiz_submissions
    ADD CONSTRAINT fk_quiz_submissions_student
    FOREIGN KEY (student_id) REFERENCES public.students(id) ON DELETE CASCADE;
END $$;
