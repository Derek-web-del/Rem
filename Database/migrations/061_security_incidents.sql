-- Incident Response: security_incidents ledger (case records built on top of
-- audit_logs / quiz_submissions.violations / lockout events). Additive only.
CREATE TABLE IF NOT EXISTS public.security_incidents (
  id BIGSERIAL PRIMARY KEY,
  incident_type VARCHAR(64) NOT NULL,               -- AUTH_BRUTE_FORCE | QUIZ_INTEGRITY | DATA_RECOVERY_EVENT
  severity VARCHAR(16) NOT NULL DEFAULT 'medium',   -- low | medium | high | critical
  status VARCHAR(16) NOT NULL DEFAULT 'open',       -- open | investigating | resolved | closed
  source_event_id VARCHAR(128),
  affected_user_id VARCHAR(128),
  affected_user_label VARCHAR(255),
  detected_by VARCHAR(32) NOT NULL DEFAULT 'system', -- 'system' or admin user id
  assigned_to VARCHAR(128),
  summary TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON public.security_incidents (status);
CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON public.security_incidents (severity);
CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON public.security_incidents (incident_type);
CREATE INDEX IF NOT EXISTS idx_security_incidents_created_at ON public.security_incidents (created_at DESC);
