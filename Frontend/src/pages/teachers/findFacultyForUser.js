import { normalizeFacultyShape } from '../../lib/lmsStateStorage.js'

function normName(s) {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function displayNameFromFaculty(f) {
  if (!f) return ''
  if (f.name) return String(f.name).trim()
  return `${f.firstName || ''} ${f.middleName || ''} ${f.lastName || ''}`.replace(/\s+/g, ' ').trim()
}

function authIdOf(f) {
  const v = f?.authUserId ?? f?.auth_user_id
  if (v == null || v === '') return ''
  return String(v).trim()
}

function emailOf(f) {
  return String(f.email ?? '').trim().toLowerCase()
}

/**
 * Match the signed-in Better Auth user to an institute faculty record from app state.
 */
export function findFacultyForUser(faculties, sessionUser) {
  if (!Array.isArray(faculties) || !sessionUser) return null
  const uid = String(sessionUser.id || '').trim()
  const email = String(sessionUser.email || '').trim().toLowerCase()
  const un = String(sessionUser.username || '').trim().toLowerCase()

  const byAuth = faculties.find((f) => {
    const aid = authIdOf(f)
    return aid === uid || (aid && uid && Number(aid) === Number(uid))
  })
  if (byAuth) return normalizeFacultyShape(byAuth)

  const byEmail = faculties.find((f) => emailOf(f) === email)
  if (byEmail) return normalizeFacultyShape(byEmail)

  if (un) {
    const byLogin = faculties.find((f) => {
      const fu = String(f.facultyUsername ?? f.faculty_username ?? f.username ?? '').trim().toLowerCase()
      const fc = String(f.facultyCode ?? f.faculty_code ?? '').trim().toLowerCase()
      return fu === un || fc === un
    })
    if (byLogin) return normalizeFacultyShape(byLogin)
  }

  const sessionDisplay = normName(sessionUser.name)
  if (sessionDisplay) {
    const sameName = faculties.filter((f) => normName(displayNameFromFaculty(f)) === sessionDisplay)
    if (sameName.length === 1) return normalizeFacultyShape(sameName[0])
  }

  return null
}

/**
 * When strict matching fails (e.g. roster row missing authUserId), pick the only plausible
 * local row: unambiguous email, login, or display-name match.
 */
export function findLocalFacultyExclusiveMatch(faculties, sessionUser) {
  if (!Array.isArray(faculties) || !sessionUser || faculties.length === 0) return null
  const email = String(sessionUser.email || '').trim().toLowerCase()
  const un = String(sessionUser.username || '').trim().toLowerCase()
  const sessionDisplay = normName(sessionUser.name)

  if (email) {
    const byEmail = faculties.filter((f) => emailOf(f) === email)
    if (byEmail.length === 1) return normalizeFacultyShape(byEmail[0])
  }
  if (un) {
    const byLogin = faculties.filter((f) => {
      const fu = String(f.facultyUsername ?? f.faculty_username ?? f.username ?? '').trim().toLowerCase()
      const fc = String(f.facultyCode ?? f.faculty_code ?? '').trim().toLowerCase()
      return fu === un || fc === un
    })
    if (byLogin.length === 1) return normalizeFacultyShape(byLogin[0])
  }
  if (sessionDisplay) {
    const byName = faculties.filter((f) => normName(displayNameFromFaculty(f)) === sessionDisplay)
    if (byName.length === 1) return normalizeFacultyShape(byName[0])
  }
  return null
}

/**
 * Overlay Better Auth user profile fields onto a faculty row (server snapshot or local browser cache)
 * when the roster row omits them.
 */
export function mergeFacultyWithSessionUser(faculty, sessionUser) {
  if (!faculty) return null
  if (!sessionUser) return normalizeFacultyShape(faculty)
  const fq = String(sessionUser.facultyQualification ?? '').trim()
  const fc = String(sessionUser.facultyContactNumber ?? '').trim()
  const img = typeof sessionUser.image === 'string' ? sessionUser.image.trim() : ''
  const un = String(sessionUser.username || '').trim()
  const out = normalizeFacultyShape({ ...faculty })
  if (!String(out.qualification || '').trim() && fq) out.qualification = fq
  if (!String(out.contactNumber || '').trim() && fc) out.contactNumber = fc
  if (!String(out.photoDataUrl || '').trim() && img) out.photoDataUrl = img
  if (!String(out.facultyUsername || '').trim() && un) out.facultyUsername = un
  if (!String(out.facultyCode || '').trim() && un) out.facultyCode = un
  if (!String(out.name || '').trim() && sessionUser.name) out.name = String(sessionUser.name).trim()
  if (!String(out.email || '').trim() && sessionUser.email) out.email = String(sessionUser.email).trim()
  const uid = String(sessionUser.id || '').trim()
  if (!String(out.authUserId || '').trim() && uid) out.authUserId = uid
  return out
}

/**
 * When institute roster is empty or not synced on this origin, still show a sensible
 * profile for teachers/admins using the signed-in Better Auth user.
 */
export function buildSessionFallbackFaculty(sessionUser) {
  if (!sessionUser) return null
  const role = String(sessionUser.role || '').toLowerCase()
  if (role !== 'teacher' && role !== 'admin') return null
  const uid = String(sessionUser.id || '').trim()
  const un = String(sessionUser.username || '').trim()
  const image = typeof sessionUser.image === 'string' ? sessionUser.image.trim() : ''
  const fq = String(sessionUser.facultyQualification ?? '').trim()
  const fc = String(sessionUser.facultyContactNumber ?? '').trim()
  return normalizeFacultyShape({
    id: uid ? `__auth_${uid}` : '__auth_fallback',
    name: String(sessionUser.name || '').trim(),
    firstName: '',
    middleName: '',
    lastName: '',
    email: String(sessionUser.email || '').trim(),
    facultyUsername: un,
    facultyCode: un,
    grade: '',
    qualification: fq,
    contactNumber: fc,
    photoDataUrl: image,
    authUserId: uid,
  })
}
