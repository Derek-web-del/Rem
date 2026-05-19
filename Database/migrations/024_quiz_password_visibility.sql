-- Quiz password protection and faculty hide/unhide

ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS quiz_password VARCHAR(255);
ALTER TABLE public.quizzes ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT FALSE;
