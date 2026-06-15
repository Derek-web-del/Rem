-- Link quiz submissions to students when orphaned rows are absent.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'fk_quiz_submissions_student'
  ) THEN
    ALTER TABLE quiz_submissions
      ADD CONSTRAINT fk_quiz_submissions_student
      FOREIGN KEY (student_id) REFERENCES students(id);
  END IF;
END $$;
