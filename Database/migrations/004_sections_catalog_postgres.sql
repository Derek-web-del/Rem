-- PostgreSQL `lenlearn_db`: catalog table `sections` (Sections module API).
-- Idempotent (IF NOT EXISTS). Same definition as `scripts/sql/lenlearn_postgres_sections_table.sql`
-- and `server/api/state.js` ensureSchema.

CREATE TABLE IF NOT EXISTS sections (
  id SERIAL PRIMARY KEY,
  section_name VARCHAR(255),
  grade_level VARCHAR(50),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sections_grade_level ON sections (grade_level);
CREATE INDEX IF NOT EXISTS idx_sections_created_at ON sections (created_at);
