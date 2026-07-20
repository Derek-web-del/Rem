/**
 * Institute Settings: single-row global config. Currently holds only the
 * active "school year" (e.g. "2025-2026"), shown as an informational badge
 * to Admin, Faculty, and Students. No filtering/archiving is tied to it.
 */

const SETTINGS_ID = 'default'
const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/

// Keyed per-pool (not a single global boolean) so a test/mock pool never
// falsely marks the real pool's table as already ensured, or vice versa.
const ensuredPools = new WeakSet()

export async function ensureInstituteSettingsTable(pool) {
  if (ensuredPools.has(pool)) return true
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.institute_settings (
        id VARCHAR(64) NOT NULL PRIMARY KEY DEFAULT 'default',
        school_year VARCHAR(16),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_by VARCHAR(191)
      )
    `)
    await pool.query(
      `INSERT INTO public.institute_settings (id, school_year) VALUES ($1, NULL) ON CONFLICT (id) DO NOTHING`,
      [SETTINGS_ID],
    )
    ensuredPools.add(pool)
    return true
  } catch (e) {
    console.warn('[institute-settings] schema ensure failed:', e?.message || e)
    return false
  }
}

export function isValidSchoolYear(value) {
  return SCHOOL_YEAR_PATTERN.test(String(value || '').trim())
}

export async function getSchoolYear(pool) {
  await ensureInstituteSettingsTable(pool)
  const { rows } = await pool.query(
    `SELECT school_year FROM public.institute_settings WHERE id = $1`,
    [SETTINGS_ID],
  )
  return rows?.[0]?.school_year || null
}

export async function setSchoolYear(pool, value, updatedByUserId) {
  const trimmed = String(value ?? '').trim()
  if (!isValidSchoolYear(trimmed)) {
    const err = new Error('INVALID_SCHOOL_YEAR')
    err.code = 'INVALID_SCHOOL_YEAR'
    throw err
  }
  await ensureInstituteSettingsTable(pool)
  const { rows } = await pool.query(
    `
    INSERT INTO public.institute_settings (id, school_year, updated_at, updated_by)
    VALUES ($1, $2, NOW(), $3)
    ON CONFLICT (id) DO UPDATE
      SET school_year = EXCLUDED.school_year,
          updated_at = NOW(),
          updated_by = EXCLUDED.updated_by
    RETURNING school_year
    `,
    [SETTINGS_ID, trimmed, String(updatedByUserId || '').trim() || null],
  )
  return rows?.[0]?.school_year || trimmed
}
