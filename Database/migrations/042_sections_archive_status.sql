-- Soft-archive support for institute sections (teacher advisory filtering).

ALTER TABLE public.sections
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_sections_active
  ON public.sections (id)
  WHERE deleted_at IS NULL AND (status IS NULL OR status != 'archived');
