-- Persist computed final grades per student per subject (gradebook save).

CREATE TABLE IF NOT EXISTS public.subject_student_final_grades (
  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  student_id INT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  final_grade NUMERIC(6, 2) NOT NULL DEFAULT 0,
  component_avgs JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(255),
  PRIMARY KEY (subject_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_subject_student_final_grades_subject
  ON public.subject_student_final_grades (subject_id);
