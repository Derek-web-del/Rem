import { getPgPool } from '../pgPool.js'
import { facultyDisplayName } from './facultySession.js'
import { studentDisplayName } from './studentPiiCrypto.js'

/**
 * Resolve the current institute roster display name for a registered email.
 * Prefers active student/faculty records over stale Better Auth user.name.
 * @param {string} email
 * @returns {Promise<string>}
 */
export async function resolvePortalDisplayNameByEmail(email) {
  const e = String(email || '').trim().toLowerCase()
  if (!e) return ''

  const pool = getPgPool()
  if (!pool) return ''

  try {
    const { rows } = await pool.query(
      `
        SELECT first_name, middle_name, last_name
        FROM students
        WHERE lower(trim(coalesce(email, ''))) = $1
          AND archived_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [e],
    )
    const studentName = studentDisplayName(rows?.[0])
    if (studentName) return studentName
  } catch {
    /* ignore */
  }

  try {
    const { rows } = await pool.query(
      `
        SELECT first_name, middle_name, last_name, name
        FROM public.faculties
        WHERE lower(trim(coalesce(email, ''))) = $1
          AND archived_at IS NULL
        ORDER BY id DESC
        LIMIT 1
      `,
      [e],
    )
    const facultyName = facultyDisplayName(rows?.[0])
    if (facultyName && facultyName !== 'Faculty') return facultyName
  } catch {
    /* ignore */
  }

  return ''
}

/**
 * Keep Better Auth user.name aligned with roster when we have a fresher display name.
 * @param {string} userId
 * @param {string} rosterName
 * @param {string} [currentName]
 */
export async function syncAuthUserNameFromRoster(userId, rosterName, currentName = '') {
  const id = String(userId || '').trim()
  const next = String(rosterName || '').trim()
  if (!id || !next) return
  if (next === String(currentName || '').trim()) return

  const pool = getPgPool()
  if (!pool) return

  try {
    await pool.query(
      `UPDATE "user" SET name = $1, "updatedAt" = NOW() WHERE id = $2`,
      [next, id],
    )
  } catch (err) {
    console.warn('[auth] syncAuthUserNameFromRoster failed:', err?.message || err)
  }
}
