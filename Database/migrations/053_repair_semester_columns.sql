-- Repair semester columns when 040_trimester_to_semester was skipped after a duplicate-object rollback.

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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'assignments' AND column_name = 'semester'
  ) THEN
    UPDATE public.assignments SET semester = 3 WHERE semester = 4;
    ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_trimester_check;
    ALTER TABLE public.assignments DROP CONSTRAINT IF EXISTS assignments_quarter_check;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'assignments_semester_check'
    ) THEN
      ALTER TABLE public.assignments ADD CONSTRAINT assignments_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'activities' AND column_name = 'semester'
  ) THEN
    UPDATE public.activities SET semester = 3 WHERE semester = 4;
    ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_trimester_check;
    ALTER TABLE public.activities DROP CONSTRAINT IF EXISTS activities_quarter_check;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'activities_semester_check'
    ) THEN
      ALTER TABLE public.activities ADD CONSTRAINT activities_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'semester'
  ) THEN
    UPDATE public.quizzes SET semester = 3 WHERE semester = 4;
    ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_trimester_check;
    ALTER TABLE public.quizzes DROP CONSTRAINT IF EXISTS quizzes_quarter_check;
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint WHERE conname = 'quizzes_semester_check'
    ) THEN
      ALTER TABLE public.quizzes ADD CONSTRAINT quizzes_semester_check CHECK (semester IS NULL OR (semester >= 1 AND semester <= 3));
    END IF;
  END IF;
END $$;
