-- Student quiz submissions and per-question answers (idempotent).

CREATE TABLE IF NOT EXISTS quiz_submissions (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES quizzes(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'not_started',
  score NUMERIC(10, 2),
  total_points NUMERIC(10, 2),
  time_spent_seconds INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  attempt_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (quiz_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_quiz_id ON quiz_submissions (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_student_id ON quiz_submissions (student_id);
CREATE INDEX IF NOT EXISTS idx_quiz_submissions_status ON quiz_submissions (status);

CREATE TABLE IF NOT EXISTS quiz_student_answers (
  id BIGSERIAL PRIMARY KEY,
  submission_id BIGINT NOT NULL REFERENCES quiz_submissions(id) ON DELETE CASCADE,
  question_id BIGINT NOT NULL REFERENCES quiz_questions(id) ON DELETE CASCADE,
  student_answer TEXT,
  selected_choice_id BIGINT REFERENCES quiz_choices(id) ON DELETE SET NULL,
  is_correct BOOLEAN,
  points_earned NUMERIC(10, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (submission_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_quiz_student_answers_submission ON quiz_student_answers (submission_id);
CREATE INDEX IF NOT EXISTS idx_quiz_student_answers_question ON quiz_student_answers (question_id);
