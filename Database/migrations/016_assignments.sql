-- Faculty assignments and student submissions (PostgreSQL lenlearn_DB).

ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS title VARCHAR(255);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS subject_id INT REFERENCES public.subjects(id) ON DELETE SET NULL;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS quarter INT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS file_path VARCHAR(512);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS file_name VARCHAR(512);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS file_size BIGINT;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS total_score INT DEFAULT 100;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS submission_deadline TIMESTAMPTZ;
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255);
ALTER TABLE public.assignments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_assignments_subject_id ON public.assignments (subject_id);
CREATE INDEX IF NOT EXISTS idx_assignments_submission_deadline ON public.assignments (submission_deadline);

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id BIGSERIAL PRIMARY KEY,
  assignment_id BIGINT NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id INT REFERENCES public.students(id) ON DELETE CASCADE,
  student_name VARCHAR(255),
  file_path VARCHAR(512),
  file_name VARCHAR(512),
  score INT,
  status VARCHAR(32) NOT NULL DEFAULT 'not_submitted',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_assignment_submissions_assignment_id ON public.assignment_submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_student_id ON public.assignment_submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_submissions_status ON public.assignment_submissions (status);
