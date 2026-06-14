import { getPgPool, isPgConfigured } from '../pgPool.js'

const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS public.backups (
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
  )`,
  `CREATE INDEX IF NOT EXISTS idx_backups_created_at ON public.backups (created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_backups_status ON public.backups (status)`,
  `CREATE TABLE IF NOT EXISTS public.backup_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    frequency VARCHAR(50) NOT NULL UNIQUE,
    time_of_day TIME DEFAULT '02:00:00',
    day_of_week INTEGER,
    day_of_month INTEGER,
    is_active BOOLEAN DEFAULT true,
    last_run TIMESTAMPTZ,
    next_run TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS public.google_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_expiry TIMESTAMPTZ,
    connected_email VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS gdrive_file_id VARCHAR(255)`,
  `ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS gdrive_link TEXT`,
  `ALTER TABLE public.backups ADD COLUMN IF NOT EXISTS gdrive_uploaded_at TIMESTAMPTZ`,
  `CREATE TABLE IF NOT EXISTS public.google_oauth_pending (
    state VARCHAR(128) PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS idx_google_oauth_pending_expires ON public.google_oauth_pending (expires_at)`,
  `ALTER TABLE public.google_oauth_tokens ADD COLUMN IF NOT EXISTS gdrive_folder_id VARCHAR(255)`,
  `ALTER TABLE public.google_oauth_tokens ADD COLUMN IF NOT EXISTS granted_scopes TEXT`,
]

const SEED_SCHEDULES_SQL = `
  INSERT INTO public.backup_schedules (frequency, is_active, time_of_day, day_of_week, day_of_month)
  VALUES
    ('daily', true, '02:00:00', NULL, NULL),
    ('weekly', false, '01:00:00', 0, NULL),
    ('monthly', false, '00:00:00', NULL, 1)
  ON CONFLICT (frequency) DO NOTHING
`

let schemaInitialized = false
let schemaInitPromise = null

export async function ensureBackupSchema(pool = getPgPool()) {
  if (!pool) return
  if (schemaInitialized) return
  if (schemaInitPromise) {
    await schemaInitPromise
    return
  }

  schemaInitPromise = (async () => {
    try {
      for (const sql of SCHEMA_STATEMENTS) {
        await pool.query(sql)
      }
      await pool.query(SEED_SCHEDULES_SQL)
      schemaInitialized = true
      console.log('[BACKUP] Schema verified successfully')
    } catch (error) {
      schemaInitPromise = null
      console.error('[BACKUP] Schema error:', error?.message || error)
      throw error
    }
  })()

  await schemaInitPromise
}

export function isBackupDbConfigured() {
  return isPgConfigured()
}
