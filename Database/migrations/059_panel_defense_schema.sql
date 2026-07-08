-- Panel defense: link subjects to curriculum guides + class schedules.

ALTER TABLE public.subjects
  ADD COLUMN IF NOT EXISTS curriculum_guide_id VARCHAR(64) REFERENCES public.curriculum_guides(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_curriculum_guide_id
  ON public.subjects (curriculum_guide_id)
  WHERE curriculum_guide_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.subject_schedules (
  id BIGSERIAL PRIMARY KEY,
  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  room VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT subject_schedules_time_order CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_subject_schedules_subject_id
  ON public.subject_schedules (subject_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_schedules_unique_slot
  ON public.subject_schedules (subject_id, day_of_week, start_time);

-- Demo schedules for up to five existing subjects (idempotent).
INSERT INTO public.subject_schedules (subject_id, day_of_week, start_time, end_time, room)
SELECT s.id, v.day_of_week, v.start_time::time, v.end_time::time, v.room
FROM (
  SELECT id, row_number() OVER (ORDER BY id) AS rn
  FROM public.subjects
  WHERE archived_at IS NULL
  ORDER BY id
  LIMIT 5
) s
JOIN (
  VALUES
    (1, 1, '08:00', '09:00', 'Room 201'),
    (2, 2, '09:00', '10:00', 'Room 202'),
    (3, 3, '10:00', '11:00', 'Room 203'),
    (4, 4, '13:00', '14:00', 'Room 204'),
    (5, 5, '14:00', '15:00', 'Room 205')
) AS v(rn, day_of_week, start_time, end_time, room) ON v.rn = s.rn
WHERE NOT EXISTS (
  SELECT 1 FROM public.subject_schedules ss WHERE ss.subject_id = s.id
);
