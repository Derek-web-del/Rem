-- Structured curriculum content: ordered units + grading-criteria weights on curriculum_guides.
-- The uploaded PDF becomes an optional attachment instead of the only source of content.

CREATE TABLE IF NOT EXISTS public.curriculum_guide_units (
  id BIGSERIAL PRIMARY KEY,
  curriculum_guide_id VARCHAR(64) NOT NULL REFERENCES public.curriculum_guides(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  unit_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_curriculum_guide_units_guide_id ON public.curriculum_guide_units (curriculum_guide_id);
CREATE INDEX IF NOT EXISTS idx_curriculum_guide_units_order ON public.curriculum_guide_units (curriculum_guide_id, unit_order);

ALTER TABLE public.curriculum_guides
  ADD COLUMN IF NOT EXISTS written_work_pct INT,
  ADD COLUMN IF NOT EXISTS performance_task_pct INT,
  ADD COLUMN IF NOT EXISTS exam_pct INT;

-- The PDF is now optional: structured units can carry the content on their own.
ALTER TABLE public.curriculum_guides ALTER COLUMN file_name DROP NOT NULL;
