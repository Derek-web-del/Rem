-- Subject curriculum modules, classwork topics, grade criteria, and item grouping columns.

CREATE TABLE IF NOT EXISTS public.subject_modules (
  id BIGSERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  module_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_modules_subject_id ON public.subject_modules (subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_modules_order ON public.subject_modules (subject_id, module_order);

CREATE TABLE IF NOT EXISTS public.subject_topics (
  id BIGSERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  topic_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_topics_subject_id ON public.subject_topics (subject_id);
CREATE INDEX IF NOT EXISTS idx_subject_topics_order ON public.subject_topics (subject_id, topic_order);

CREATE TABLE IF NOT EXISTS public.subject_module_subtopics (
  id BIGSERIAL PRIMARY KEY,
  module_id BIGINT NOT NULL REFERENCES public.subject_modules(id) ON DELETE CASCADE,
  label VARCHAR(255) NOT NULL,
  subtopic_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subject_module_subtopics_module ON public.subject_module_subtopics (module_id);

CREATE TABLE IF NOT EXISTS public.subject_grade_criteria (
  subject_id INT PRIMARY KEY REFERENCES public.subjects(id) ON DELETE CASCADE,
  written_work_pct INT NOT NULL DEFAULT 25,
  performance_task_pct INT NOT NULL DEFAULT 45,
  quizzes_pct INT NOT NULL DEFAULT 15,
  activities_pct INT NOT NULL DEFAULT 15,
  written_work_color VARCHAR(32) DEFAULT '#3B82F6',
  performance_task_color VARCHAR(32) DEFAULT '#F59E0B',
  quizzes_color VARCHAR(32) DEFAULT '#8B5CF6',
  activities_color VARCHAR(32) DEFAULT '#10B981',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.study_materials
  ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES public.subject_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_id BIGINT REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subtopic_label VARCHAR(100),
  ADD COLUMN IF NOT EXISTS module_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';

ALTER TABLE public.assignments
  ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES public.subject_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_id BIGINT REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';

ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES public.subject_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_id BIGINT REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';

ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS subject_id INT REFERENCES public.subjects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_id BIGINT REFERENCES public.subject_modules(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS topic_id BIGINT REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_order INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'published';

CREATE INDEX IF NOT EXISTS idx_study_materials_module ON public.study_materials (module_id);
CREATE INDEX IF NOT EXISTS idx_study_materials_topic ON public.study_materials (topic_id);
CREATE INDEX IF NOT EXISTS idx_assignments_module ON public.assignments (module_id);
CREATE INDEX IF NOT EXISTS idx_assignments_topic ON public.assignments (topic_id);
CREATE INDEX IF NOT EXISTS idx_activities_module ON public.activities (module_id);
CREATE INDEX IF NOT EXISTS idx_activities_topic ON public.activities (topic_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_subject_id ON public.quizzes (subject_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_module ON public.quizzes (module_id);
CREATE INDEX IF NOT EXISTS idx_quizzes_topic ON public.quizzes (topic_id);
