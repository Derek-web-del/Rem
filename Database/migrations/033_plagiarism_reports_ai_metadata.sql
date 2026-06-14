-- AI plagiarism checker metadata (analysis method, provider, lexical/semantic scores)
ALTER TABLE plagiarism_reports
  ADD COLUMN IF NOT EXISTS analysis_method VARCHAR(128) DEFAULT 'TF-IDF + Cosine Similarity',
  ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32) DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS lexical_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS semantic_score NUMERIC(5,2);
