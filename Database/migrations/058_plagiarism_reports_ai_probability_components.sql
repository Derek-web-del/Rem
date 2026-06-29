-- AI probability sub-scores (lexical + semantic authorship signals)
ALTER TABLE plagiarism_reports
  ADD COLUMN IF NOT EXISTS ai_lexical_score NUMERIC(5, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_semantic_score NUMERIC(5, 2) DEFAULT NULL;
