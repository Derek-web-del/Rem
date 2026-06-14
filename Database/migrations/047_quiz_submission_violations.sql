-- Quiz session integrity violations (tab switch, fullscreen exit, etc.)
ALTER TABLE quiz_submissions
  ADD COLUMN IF NOT EXISTS violations JSONB NOT NULL DEFAULT '[]';
