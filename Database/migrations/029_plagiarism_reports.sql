-- Faculty Originality Checker — plagiarism analysis reports

CREATE TABLE IF NOT EXISTS public.plagiarism_reports (
  id BIGSERIAL PRIMARY KEY,
  faculty_id VARCHAR(64) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  input_type VARCHAR(32) NOT NULL DEFAULT 'text',
  file_name VARCHAR(512),
  similarity_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
  flagged_sentences JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources_checked INTEGER NOT NULL DEFAULT 5,
  processing_time_ms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_faculty_id ON public.plagiarism_reports (faculty_id);
CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_created_at ON public.plagiarism_reports (created_at DESC);
