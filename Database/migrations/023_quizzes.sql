-- Faculty Quiz Maker module

CREATE TABLE IF NOT EXISTS public.quizzes (
  id BIGSERIAL PRIMARY KEY,
  title VARCHAR(255) NOT NULL DEFAULT '',
  description TEXT,
  instructions TEXT,
  activity_type VARCHAR(64) NOT NULL DEFAULT 'Quiz',
  subject VARCHAR(128),
  grade_level VARCHAR(128),
  branch VARCHAR(128),
  quarter SMALLINT,
  duration_mins INTEGER,
  deadline TIMESTAMPTZ,
  total_points NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_by VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.quiz_parts (
  id BIGSERIAL PRIMARY KEY,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  part_title VARCHAR(255),
  question_type VARCHAR(64) NOT NULL,
  no_of_questions INTEGER NOT NULL DEFAULT 0,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quiz_questions (
  id BIGSERIAL PRIMARY KEY,
  part_id BIGINT NOT NULL REFERENCES public.quiz_parts(id) ON DELETE CASCADE,
  quiz_id BIGINT NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  question_text TEXT,
  question_type VARCHAR(64) NOT NULL,
  points NUMERIC(10, 2) NOT NULL DEFAULT 1,
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.quiz_choices (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  choice_label VARCHAR(8),
  choice_text TEXT,
  is_correct BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS public.quiz_answers (
  id BIGSERIAL PRIMARY KEY,
  question_id BIGINT NOT NULL REFERENCES public.quiz_questions(id) ON DELETE CASCADE,
  answer_text TEXT,
  match_pair TEXT
);

CREATE INDEX IF NOT EXISTS idx_quizzes_created_by ON public.quizzes (created_by);
CREATE INDEX IF NOT EXISTS idx_quiz_parts_quiz_id ON public.quiz_parts (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_quiz_id ON public.quiz_questions (quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_questions_part_id ON public.quiz_questions (part_id);
