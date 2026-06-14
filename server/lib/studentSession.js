/** Resolve PostgreSQL `students` row for an authenticated Better Auth student session. */

import { decryptStudentPiiFields } from './studentPiiCrypto.js'

const NA = 'N/A'

export function studentDisplayName(row) {
  if (!row || typeof row !== 'object') return 'Student'
  const composed = [row.first_name, row.middle_name, row.last_name].filter(Boolean).join(' ').trim()
  return composed || String(row.email || row.login_id || 'Student').trim()
}

export function resolveStudentAuthIdentifiers(user) {
  const email = String(user?.email || '').trim().toLowerCase()
  const username = String(user?.username || user?.displayUsername || '').trim().toLowerCase()
  return { email, username }
}

export async function ensureStudentTermsColumns(pool) {
  try {
    await pool.query(`
      ALTER TABLE public.students
        ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false
    `)
    await pool.query(`
      ALTER TABLE public.students
        ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL
    `)
  } catch {
    /* non-fatal */
  }
}

/** Load auth email/username/display login id for session user. */
export async function enrichAuthIdentifiers(pool, user) {
  let { email, username } = resolveStudentAuthIdentifiers(user)
  const userId = String(user?.id || '').trim()
  let displayLoginId = String(user?.displayUsername || user?.username || '').trim()

  if (userId) {
    try {
      const { rows } = await pool.query(
        `SELECT username, email, "displayUsername" FROM "user" WHERE id = $1 LIMIT 1`,
        [userId],
      )
      const authUser = rows?.[0]
      if (authUser) {
        if (!username) username = String(authUser.username || '').trim().toLowerCase()
        if (!email) email = String(authUser.email || '').trim().toLowerCase()
        const authDisplay = String(authUser.displayUsername || authUser.username || '').trim()
        if (authDisplay) displayLoginId = authDisplay
      }
    } catch {
      /* auth table may be unavailable */
    }
  }

  return { email, username, userId, displayLoginId }
}

export async function fetchStudentRowForSession(pool, user) {
  const { email, username, userId } = await enrichAuthIdentifiers(pool, user)
  if (!email && !username && !userId) return null

  const { rows } = await pool.query(
    `
      SELECT s.*, sec.section_name AS section_name
      FROM public.students s
      LEFT JOIN public.sections sec ON sec.id = s.section_id
      WHERE (
        ($1 <> '' AND s.auth_user_id = $1)
        OR (
          $2 <> '' AND lower(trim(coalesce(s.email, ''))) = $2
          AND (s.auth_user_id IS NULL OR trim(coalesce(s.auth_user_id, '')) = '' OR s.auth_user_id = $1)
        )
        OR ($3 <> '' AND lower(trim(coalesce(s.login_id, ''))) = $3)
        OR ($2 <> '' AND lower(trim(coalesce(s.email, ''))) = $2)
        OR (
          $1 <> '' AND EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.id = $1
              AND (
                lower(trim(coalesce(s.login_id, ''))) = lower(trim(coalesce(u.username, '')))
                OR lower(trim(coalesce(s.email, ''))) = lower(trim(coalesce(u.email, '')))
              )
          )
        )
      )
      AND (s.archived_at IS NULL)
      ORDER BY
        CASE WHEN $1 <> '' AND s.auth_user_id = $1 THEN 0 ELSE 1 END,
        CASE WHEN $3 <> '' AND lower(trim(coalesce(s.login_id, ''))) = $3 THEN 0 ELSE 1 END,
        CASE WHEN $2 <> '' AND lower(trim(coalesce(s.email, ''))) = $2 THEN 0 ELSE 1 END,
        s.id DESC
      LIMIT 1
    `,
    [userId, email, username],
  )
  const row = rows?.[0] || null
  if (row && userId && !String(row.auth_user_id || '').trim()) {
    try {
      await pool.query(
        `UPDATE public.students SET auth_user_id = $1 WHERE id = $2 AND (auth_user_id IS NULL OR trim(coalesce(auth_user_id, '')) = '')`,
        [userId, row.id],
      )
      row.auth_user_id = userId
    } catch {
      /* non-fatal */
    }
  }
  return row ? decryptStudentPiiFields(row) : null
}

function fieldOrNa(value) {
  const s = String(value ?? '').trim()
  return s || NA
}

function resolveStudentLoginId(row, authHints) {
  const fromRow = String(row?.login_id ?? row?.loginId ?? '').trim()
  if (fromRow) return fromRow
  const fromAuth = String(authHints?.displayLoginId ?? '').trim()
  if (fromAuth) return fromAuth
  const fromUsername = String(authHints?.username ?? '').trim()
  if (fromUsername) return fromUsername
  return ''
}

export function mapStudentProfile(row, authHints = null) {
  if (!row) return null
  const dob = row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : row.dob ?? null
  const loginIdRaw = resolveStudentLoginId(row, authHints)
  const loginId = loginIdRaw ? loginIdRaw : NA

  return {
    id: row.id != null ? String(row.id) : '',
    fullName: studentDisplayName(row),
    loginId,
    login_id: loginId,
    studentLoginId: loginId,
    enrollmentNo: fieldOrNa(row.enrollment_no),
    enrollment_no: fieldOrNa(row.enrollment_no),
    photoUrl: String(row.photo_url ?? '').trim() || '',
    rollNo: fieldOrNa(row.roll_no),
    semester: fieldOrNa(row.semester),
    gradeLevel: fieldOrNa(row.grade_level),
    section: fieldOrNa(row.section_name),
    primaryContact: fieldOrNa(row.contact_no),
    email: fieldOrNa(row.email),
    dob: dob ? String(dob) : NA,
    parentContact: fieldOrNa(row.parent_contact),
    sectionId: row.section_id != null ? String(row.section_id) : '',
    termsAccepted: row.terms_accepted === true,
    termsAcceptedAt: row.terms_accepted_at ?? null,
  }
}

export function normalizeGradeLevel(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/** Resolve grade from student row, legacy `grade` column, or enrolled section. */
export async function resolveStudentGradeLevel(pool, studentRow) {
  const direct = normalizeGradeLevel(studentRow?.grade_level ?? studentRow?.grade)
  if (direct) return direct
  if (!pool || !studentRow) return ''
  const sectionId = Number(studentRow.section_id)
  if (!Number.isFinite(sectionId) || sectionId <= 0) return ''
  try {
    const { rows } = await pool.query(
      `SELECT grade_level FROM sections WHERE id = $1 LIMIT 1`,
      [sectionId],
    )
    return normalizeGradeLevel(rows?.[0]?.grade_level)
  } catch {
    return ''
  }
}

export async function markStudentTermsAccepted(pool, studentId) {
  await ensureStudentTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE public.students
      SET terms_accepted = true,
          terms_accepted_at = COALESCE(terms_accepted_at, NOW())
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [studentId],
  )
  return rows?.[0] || null
}

export async function clearStudentTermsAccepted(pool, studentId) {
  await ensureStudentTermsColumns(pool)
  const { rows } = await pool.query(
    `
      UPDATE public.students
      SET terms_accepted = false
      WHERE id = $1
      RETURNING terms_accepted, terms_accepted_at
    `,
    [studentId],
  )
  return rows?.[0] || null
}
