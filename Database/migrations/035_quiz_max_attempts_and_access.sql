-- Quiz attempt limits and persistent student passcode access grants
ALTER TABLE public.quizzes
  ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS public.quiz_password_access (
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  auth_user_id VARCHAR(64) NOT NULL,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (quiz_id, auth_user_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_password_access_expires ON public.quiz_password_access (expires_at);
