-- Per-subject syllabus weeks, auto-generated from the subject's linked curriculum guide units
-- (curriculum_guide_units, see 064) and refinable by faculty without touching the source curriculum.

CREATE TABLE IF NOT EXISTS public.subject_syllabus_weeks (
  id BIGSERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  source_unit_id BIGINT REFERENCES public.curriculum_guide_units(id) ON DELETE SET NULL,
  title VARCHAR(255) NOT NULL,
  content TEXT,
  week_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_syllabus_weeks_subject_id ON public.subject_syllabus_weeks (subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_syllabus_weeks_order ON public.subject_syllabus_weeks (subject_id, week_order);
