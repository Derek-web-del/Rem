-- Custom, addable grading criteria for curriculum guides (replaces the fixed
-- written_work_pct/performance_task_pct/exam_pct three-field model with a
-- flexible list, matching how subjects already store their own criteria in
-- subject_grade_components).

ALTER TABLE public.curriculum_guides
  ADD COLUMN IF NOT EXISTS grading_criteria JSONB;

-- Backfill existing fixed-percentage guides into the new shape so nothing
-- already entered is lost.
UPDATE public.curriculum_guides
SET grading_criteria = (
  SELECT jsonb_agg(v)
  FROM (
    VALUES
      (jsonb_build_object('name', 'Written Work', 'percentage', written_work_pct)),
      (jsonb_build_object('name', 'Performance Task', 'percentage', performance_task_pct)),
      (jsonb_build_object('name', 'Exam', 'percentage', exam_pct))
  ) AS t(v)
  WHERE (v->>'percentage')::int > 0
)
WHERE grading_criteria IS NULL
  AND (COALESCE(written_work_pct, 0) + COALESCE(performance_task_pct, 0) + COALESCE(exam_pct, 0)) > 0;
