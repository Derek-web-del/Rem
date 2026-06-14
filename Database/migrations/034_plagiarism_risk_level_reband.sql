-- Recompute risk_level to match Interpretation Guide: 0–30 Low, 31–70 Medium, 71–100 High
UPDATE plagiarism_reports
SET risk_level = CASE
  WHEN similarity_score <= 30 THEN 'Low'
  WHEN similarity_score <= 70 THEN 'Medium'
  ELSE 'High'
END;
