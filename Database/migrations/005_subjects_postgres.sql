-- PostgreSQL `lenlearn_db`: catalog table `subjects` (Subjects module API).

-- Idempotent (IF NOT EXISTS). Same definition as `scripts/sql/lenlearn_postgres_subjects_table.sql`

-- and `server/api/state.js` ensureSubjectsTable.



CREATE TABLE IF NOT EXISTS subjects (

  id SERIAL PRIMARY KEY,

  subject_photo TEXT,

  subject_code VARCHAR(50) UNIQUE NOT NULL,

  subject_name VARCHAR(255) NOT NULL,

  grade_level VARCHAR(64) NOT NULL,

  quarter VARCHAR(16) NOT NULL,

  faculty_id VARCHAR(64) REFERENCES faculties(id) ON DELETE SET NULL,

  syllabus_pdf TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW()

);



CREATE INDEX IF NOT EXISTS idx_subjects_grade_level ON subjects (grade_level);

CREATE INDEX IF NOT EXISTS idx_subjects_quarter ON subjects (quarter);

CREATE INDEX IF NOT EXISTS idx_subjects_faculty_id ON subjects (faculty_id);

