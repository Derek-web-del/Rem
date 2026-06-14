-- Structured teacher audit columns for public.audit_logs (complements payload JSONB).
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS event_type VARCHAR(128),
  ADD COLUMN IF NOT EXISTS module VARCHAR(64),
  ADD COLUMN IF NOT EXISTS action VARCHAR(32),
  ADD COLUMN IF NOT EXISTS performed_by VARCHAR(128),
  ADD COLUMN IF NOT EXISTS performed_by_name VARCHAR(512),
  ADD COLUMN IF NOT EXISTS target_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS target_label TEXT,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS changed_fields TEXT[],
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs (event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs (module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs (performed_by);
CREATE INDEX IF NOT EXISTS idx_audit_logs_target_label ON public.audit_logs USING gin (to_tsvector('simple', coalesce(target_label, '')));
