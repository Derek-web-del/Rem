-- Extend curriculum_guides for faculty-visible published PDFs (PostgreSQL).
-- Runtime ensureSchema also applies these via server/lib/curriculumGuidesDb.js.

ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS title VARCHAR(255) NULL;
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS file_url TEXT NULL;
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS grade_level VARCHAR(50) NULL;
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS is_published BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS uploaded_by_name VARCHAR(255) NULL;
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS source VARCHAR(32) NOT NULL DEFAULT 'app_state';
ALTER TABLE curriculum_guides ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_curriculum_guides_published ON curriculum_guides (is_published);
CREATE INDEX IF NOT EXISTS idx_curriculum_guides_grade_level ON curriculum_guides (grade_level);
