-- Rename trimester (or legacy quarter) columns to semester.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.subjects RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.subjects RENAME COLUMN quarter TO semester;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_subjects_trimester;
DROP INDEX IF EXISTS idx_subjects_quarter;
CREATE INDEX IF NOT EXISTS idx_subjects_semester ON public.subjects (semester);

UPDATE public.subjects SET semester = '3' WHERE semester IN ('4', '4.0') OR semester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.students SET semester = '3' WHERE semester IN ('4', '4.0') OR semester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.faculties RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.faculties RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.faculties SET semester = '3' WHERE semester IN ('4', '4.0') OR semester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.assignments RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.assignments RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.assignments SET semester = 3 WHERE semester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.activities RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.activities RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.activities SET semester = 3 WHERE semester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.quizzes RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.quizzes RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.quizzes SET semester = 3 WHERE semester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'study_materials' AND column_name = 'trimester'
  ) THEN
    ALTER TABLE public.study_materials RENAME COLUMN trimester TO semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'study_materials' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.study_materials RENAME COLUMN quarter TO semester;
  END IF;
END $$;

UPDATE public.study_materials SET semester = '3' WHERE semester IN ('4', '4.0') OR semester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subject_materials' AND column_name = 'subject_trimester'
  ) THEN
    ALTER TABLE public.subject_materials RENAME COLUMN subject_trimester TO subject_semester;
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subject_materials' AND column_name = 'subject_quarter'
  ) THEN
    ALTER TABLE public.subject_materials RENAME COLUMN subject_quarter TO subject_semester;
  END IF;
END $$;

UPDATE public.subject_materials SET subject_semester = '3' WHERE subject_semester IN ('4', '4.0') OR subject_semester ~ '^4$';

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_trimester_check;
ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_quarter_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_trimester_check;
ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_quarter_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));

ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_trimester_check;
ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_quarter_check;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));
