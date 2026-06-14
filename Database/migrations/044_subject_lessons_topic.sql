-- Repurpose subject_modules as Lessons: attach to topics with optional content fields.

ALTER TABLE public.subject_modules
  ADD COLUMN IF NOT EXISTS topic_id BIGINT REFERENCES public.subject_topics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS file_path VARCHAR(512),
  ADD COLUMN IF NOT EXISTS lesson_number INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_subject_modules_topic ON public.subject_modules (topic_id);
CREATE INDEX IF NOT EXISTS idx_subject_modules_topic_lesson_number ON public.subject_modules (topic_id, lesson_number);
