import { clearAdminTermsAccepted } from './adminTerms.js'
import { clearFacultyTermsAccepted } from './facultyTerms.js'
import { fetchFacultyRowForSession } from './facultySession.js'
import { fetchStudentRowForSession, clearStudentTermsAccepted } from './studentSession.js'

/**
 * Clear portal terms acceptance on sign-out so the next login shows the terms gate.
 * Preserves terms_accepted_at for audit history.
 * @param {import('pg').Pool | null | undefined} pool
 * @param {{ id?: string, role?: string } | null | undefined} user
 */
export async function clearPortalTermsOnLogout(pool, user) {
  if (!pool || !user?.id) return

  const role = String(user.role || '').trim().toLowerCase()

  try {
    if (role === 'admin' || role === 'registrar') {
      await clearAdminTermsAccepted(pool, String(user.id))
    }

    if (role === 'teacher' || role === 'faculty') {
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (facultyRow?.id) {
        await clearFacultyTermsAccepted(pool, facultyRow.id)
      }
    }

    const studentRow = await fetchStudentRowForSession(pool, user)
    if (studentRow?.id && (role === 'student' || role === 'user')) {
      await clearStudentTermsAccepted(pool, studentRow.id)
    }
  } catch (e) {
    console.warn('[portalTermsReset] clear on logout failed:', e?.message || e)
  }
}