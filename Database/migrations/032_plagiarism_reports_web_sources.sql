-- Faculty Originality Checker — web sources and risk level

ALTER TABLE public.plagiarism_reports
  ADD COLUMN IF NOT EXISTS web_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) NOT NULL DEFAULT 'Low';
