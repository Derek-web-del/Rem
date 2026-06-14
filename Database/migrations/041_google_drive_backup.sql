-- Google Drive OAuth tokens (per admin user) and backup upload metadata.

CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
  id BIGSERIAL PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL UNIQUE,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  connected_email VARCHAR(255),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.backups
  ADD COLUMN IF NOT EXISTS gdrive_file_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS gdrive_link TEXT,
  ADD COLUMN IF NOT EXISTS gdrive_uploaded_at TIMESTAMPTZ;
