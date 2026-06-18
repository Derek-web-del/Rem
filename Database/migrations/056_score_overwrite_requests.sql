-- Teacher score overwrite requests (post-deadline admin approval workflow).
CREATE TABLE IF NOT EXISTS public.score_overwrite_requests (
  id BIGSERIAL PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  student_id BIGINT NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  entity_type VARCHAR(20) NOT NULL,
  entity_id BIGINT NOT NULL,
  submission_id BIGINT NOT NULL,
  current_score NUMERIC(10,2),
  requested_score NUMERIC(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  admin_id TEXT,
  admin_notes TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT score_overwrite_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected'))
);

CREATE INDEX IF NOT EXISTS idx_score_overwrite_status
  ON public.score_overwrite_requests (status, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_score_overwrite_pending_submission
  ON public.score_overwrite_requests (submission_id)
  WHERE status = 'pending';
