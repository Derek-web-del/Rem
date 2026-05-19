-- Extend announcements table with metadata for faculty/admin file handling.

ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_path VARCHAR(512);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS image_name VARCHAR(255);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS uploaded_by VARCHAR(255);
ALTER TABLE announcements ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

UPDATE announcements SET updated_at = created_at WHERE updated_at IS NULL;
