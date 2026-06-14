-- Rename quarter columns to trimester and cap legacy quarter=4 values to 3.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subjects' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.subjects RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_subjects_quarter;
CREATE INDEX IF NOT EXISTS idx_subjects_trimester ON public.subjects (trimester);

UPDATE public.subjects SET trimester = '3' WHERE trimester IN ('4', '4.0') OR trimester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'students' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.students RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.students SET trimester = '3' WHERE trimester IN ('4', '4.0') OR trimester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.faculties RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.faculties SET trimester = '3' WHERE trimester IN ('4', '4.0') OR trimester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.assignments RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.assignments SET trimester = 3 WHERE trimester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.activities RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.activities SET trimester = 3 WHERE trimester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.quizzes RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.quizzes SET trimester = 3 WHERE trimester = 4;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'study_materials' AND column_name = 'quarter'
  ) THEN
    ALTER TABLE public.study_materials RENAME COLUMN quarter TO trimester;
  END IF;
END $$;

UPDATE public.study_materials SET trimester = '3' WHERE trimester IN ('4', '4.0') OR trimester ~ '^4$';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'subject_materials' AND column_name = 'subject_quarter'
  ) THEN
    ALTER TABLE public.subject_materials RENAME COLUMN subject_quarter TO subject_trimester;
  END IF;
END $$;

UPDATE public.subject_materials SET subject_trimester = '3' WHERE subject_trimester IN ('4', '4.0') OR subject_trimester ~ '^4$';

ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_trimester_check;
ALTER TABLE public.assignments ADD CONSTRAINT assignments_trimester_check CHECK (trimester IS NULL OR (trimester >= 1 AND trimester <= 3));

ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_trimester_check;
ALTER TABLE public.activities ADD CONSTRAINT activities_trimester_check CHECK (trimester IS NULL OR (trimester >= 1 AND trimester <= 3));

ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_trimester_check;
ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_trimester_check CHECK (trimester IS NULL OR (trimester >= 1 AND trimester <= 3));
