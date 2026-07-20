-- Institute Settings: single-row global config (currently just the active
-- school year, e.g. "2025-2026"). Informational/display only — no filtering
-- or archiving is tied to this value.
CREATE TABLE IF NOT EXISTS public.institute_settings (
  id VARCHAR(64) NOT NULL PRIMARY KEY DEFAULT 'default',
  school_year VARCHAR(16),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by VARCHAR(191)
);

INSERT INTO public.institute_settings (id, school_year)
VALUES ('default', NULL)
ON CONFLICT (id) DO NOTHING;
