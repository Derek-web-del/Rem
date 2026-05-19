-- Canonical institute roster is public.faculties (VARCHAR ids, active data, FK targets).
-- public.faculty was an empty duplicate catalog (SERIAL ids) — removed.
-- public.faculty_sections is recreated to reference public.faculties.

DROP TABLE IF EXISTS public.faculty_sections;
DROP TABLE IF EXISTS public.faculty;

CREATE TABLE IF NOT EXISTS public.faculty_sections (
  faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
  section_id INT NOT NULL REFERENCES public.sections(id) ON DELETE CASCADE,
  PRIMARY KEY (faculty_id, section_id)
);

CREATE INDEX IF NOT EXISTS idx_faculty_sections_section ON public.faculty_sections (section_id);
