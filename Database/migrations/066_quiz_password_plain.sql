-- Plaintext copy of the quiz passcode, for teacher-facing display/copy only.
-- Verification stays on the existing bcrypt hash in quiz_password — this column is never
-- used for auth, only so the teacher can look the code back up and share it in-app.

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS quiz_password_plain VARCHAR(64);
