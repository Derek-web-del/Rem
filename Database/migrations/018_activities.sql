-- Faculty activities and student submissions (PostgreSQL lenlearn_DB).

CREATE TABLE IF NOT EXISTS public.activities (
  id BIGSERIAL PRIMARY KEY,
  faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
  title VARCHAR(255),
  description TEXT,
  subject_id INT REFERENCES public.subjects(id) ON DELETE SET NULL,
  subject_name VARCHAR(100),
  grade_level VARCHAR(50),
  quarter INT,
  file_path VARCHAR(512),
  file_name VARCHAR(512),
  file_size BIGINT,
  total_score INT DEFAULT 100,
  submission_deadline TIMESTAMPTZ,
  uploaded_by VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_activities_faculty_id ON public.activities (faculty_id);
CREATE INDEX IF NOT EXISTS idx_activities_subject_id ON public.activities (subject_id);
CREATE INDEX IF NOT EXISTS idx_activities_grade_level ON public.activities (grade_level);
CREATE INDEX IF NOT EXISTS idx_activities_submission_deadline ON public.activities (submission_deadline);

CREATE TABLE IF NOT EXISTS public.activity_submissions (
  id BIGSERIAL PRIMARY KEY,
  activity_id BIGINT NOT NULL REFERENCES public.activities(id) ON DELETE CASCADE,
  student_id INT REFERENCES public.students(id) ON DELETE CASCADE,
  student_name VARCHAR(255),
  file_path VARCHAR(512),
  file_name VARCHAR(512),
  score INT,
  status VARCHAR(32) NOT NULL DEFAULT 'not_submitted',
  submitted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (activity_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_activity_submissions_activity_id ON public.activity_submissions (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_submissions_student_id ON public.activity_submissions (student_id);
