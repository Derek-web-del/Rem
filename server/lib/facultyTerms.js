import { fetchFacultyRowForSession } from './facultySession.js'
import { isTermsExemptRequest, sendTermsNotAccepted } from './termsGate.js'

/** Faculty terms acceptance on public.faculties */

export async function ensureFacultyTermsColumns(pool) {
  try {
    await pool.query(`
      ALTER TABLE public.faculties
        ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false
    `)
    await pool.query(`
      ALTER TABLE public.faculties
        ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL
    `)
  } catch {
    /* non-fatal */
  }
}

export function facultyTermsAccepted(row) {
  return row?.terms_accepted === true
}

export async function markFacultyTermsAccepted(pool, facultyId) {
  await ensureFacultyTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE public.faculties
      SET terms_accepted = true,
          terms_accepted_at = COALESCE(terms_accepted_at, NOW())
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [facultyId],
  )
  return rows?.[0] || null
}

export async function clearFacultyTermsAccepted(pool, facultyId) {
  await ensureFacultyTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE public.faculties
      SET terms_accepted = false
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [facultyId],
  )
  return rows?.[0] || null
}

/** Returns false and sends 403 if faculty terms not accepted (skips terms API routes). */
export async function enforceFacultyTermsAccepted(req, res, pool, user) {
  if (isTermsExemptRequest(req)) return true
  if (!pool || !user?.id) return true
  await ensureFacultyTermsColumns(pool)
  const facultyRow = await fetchFacultyRowForSession(pool, user)
  if (facultyRow && !facultyTermsAccepted(facultyRow)) {
    sendTermsNotAccepted(res, 'faculty portal')
    return false
  }
  return true
}
