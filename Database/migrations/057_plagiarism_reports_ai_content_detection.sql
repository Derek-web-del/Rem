-- AI-generated content detection results (local perplexity + burstiness)
ALTER TABLE plagiarism_reports
  ADD COLUMN IF NOT EXISTS ai_probability NUMERIC(5, 2) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_verdict VARCHAR(50) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_sentence_results JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_detection_enabled BOOLEAN DEFAULT FALSE;
