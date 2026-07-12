-- DigitalOcean Spaces backup metadata (.lnbak archives).
ALTER TABLE public.backups
  ADD COLUMN IF NOT EXISTS spaces_object_key TEXT,
  ADD COLUMN IF NOT EXISTS spaces_upload_status VARCHAR(32),
  ADD COLUMN IF NOT EXISTS spaces_upload_error TEXT,
  ADD COLUMN IF NOT EXISTS spaces_uploaded_at TIMESTAMPTZ;
