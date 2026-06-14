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
  const userId = String(user.id)

  try {
    if (role === 'admin') {
      await clearAdminTermsAccepted(pool, userId)
      return
    }

    if (role === 'teacher' || role === 'faculty') {
      const facultyRow = await fetchFacultyRowForSession(pool, user)
      if (facultyRow?.id) {
        await clearFacultyTermsAccepted(pool, facultyRow.id)
      }
      return
    }

    if (role === 'student') {
      const studentRow = await fetchStudentRowForSession(pool, user)
      if (studentRow?.id) {
        await clearStudentTermsAccepted(pool, studentRow.id)
      }
    }
  } catch (e) {
    console.warn('[portalTermsReset] clear on logout failed:', e?.message || e)
  }
}
