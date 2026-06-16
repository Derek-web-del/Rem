-- Google Drive OAuth tokens (per admin user) and backup upload metadata.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.backups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) DEFAULT 'manual',
  status VARCHAR(50) DEFAULT 'pending',
  size_mb DECIMAL(10,2),
  file_path TEXT,
  notes TEXT,
  tables_included TEXT[],
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_backups_created_at ON public.backups (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_backups_status ON public.backups (status);

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
