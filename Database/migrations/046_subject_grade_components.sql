-- Dynamic per-subject grading components (replaces fixed subject_grade_criteria columns).



CREATE TABLE IF NOT EXISTS public.subject_grade_components (

  id BIGSERIAL PRIMARY KEY,

  subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,

  name VARCHAR(100) NOT NULL,

  percentage INT NOT NULL DEFAULT 0,

  color VARCHAR(32) DEFAULT '#3B82F6',

  component_order INT NOT NULL DEFAULT 0,

  maps_to_assignment BOOLEAN NOT NULL DEFAULT false,

  maps_to_activity BOOLEAN NOT NULL DEFAULT false,

  is_quiz BOOLEAN NOT NULL DEFAULT false,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()

);



CREATE INDEX IF NOT EXISTS idx_subject_grade_components_subject

  ON public.subject_grade_components (subject_id, component_order);



INSERT INTO public.subject_grade_components (

  subject_id, name, percentage, color, component_order,

  maps_to_assignment, maps_to_activity, is_quiz

)

SELECT

  c.subject_id,

  v.name,

  v.percentage,

  v.color,

  v.component_order,

  v.maps_to_assignment,

  v.maps_to_activity,

  v.is_quiz

FROM public.subject_grade_criteria c

CROSS JOIN LATERAL (

  VALUES

    ('Written Work', c.written_work_pct, COALESCE(c.written_work_color, '#3B82F6'), 0, true, false, false),

    ('Performance Task', c.performance_task_pct, COALESCE(c.performance_task_color, '#F59E0B'), 1, true, true, false),

    ('Quizzes', c.quizzes_pct, COALESCE(c.quizzes_color, '#8B5CF6'), 2, false, false, true),

    ('Activities', c.activities_pct, COALESCE(c.activities_color, '#10B981'), 3, false, true, false)

) AS v(name, percentage, color, component_order, maps_to_assignment, maps_to_activity, is_quiz)

WHERE NOT EXISTS (

  SELECT 1 FROM public.subject_grade_components sgc WHERE sgc.subject_id = c.subject_id

);



INSERT INTO public.subject_grade_components (

  subject_id, name, percentage, color, component_order,

  maps_to_assignment, maps_to_activity, is_quiz

)

SELECT

  s.id,

  v.name,

  v.percentage,

  v.color,

  v.component_order,

  v.maps_to_assignment,

  v.maps_to_activity,

  v.is_quiz

FROM public.subjects s

CROSS JOIN LATERAL (

  VALUES

    ('Written Work', 25, '#3B82F6', 0, true, false, false),

    ('Performance Task', 45, '#F59E0B', 1, true, true, false),

    ('Quizzes', 15, '#8B5CF6', 2, false, false, true),

    ('Activities', 15, '#10B981', 3, false, true, false)

) AS v(name, percentage, color, component_order, maps_to_assignment, maps_to_activity, is_quiz)

WHERE NOT EXISTS (

  SELECT 1 FROM public.subject_grade_components sgc WHERE sgc.subject_id = s.id

);



ALTER TABLE public.assignments

  ADD COLUMN IF NOT EXISTS grade_component_id BIGINT;



ALTER TABLE public.activities

  ADD COLUMN IF NOT EXISTS grade_component_id BIGINT;


