-- Optional section scoping for classwork (Dr. Kirk: "assignments, activities,
-- quiz maker, and grades should be per subject and section").
--
-- Nullable and additive on purpose: a subject with no section_id keeps today's
-- behavior exactly (visible to the whole grade level). A teacher who sets a
-- section on a subject scopes that subject's classwork to just that section.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS section_id INT REFERENCES public.sections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_section_id
  ON public.subjects (section_id) WHERE section_id IS NOT NULL;
