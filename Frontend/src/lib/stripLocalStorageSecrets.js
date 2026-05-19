/** Keys that must never be persisted in browser storage (OWASP A02 / ROW 7). */
const SECRET_KEYS = new Set([
  'password',
  'appPassword',
  'appPasswordGmail',
  'app_password',
  'app_password_gmail',
  'password_hash',
  'raw_password_placeholder',
  'token',
  'sessionToken',
  'jwt',
  'accessToken',
  'refreshToken',
])

function stripObject(obj) {
  if (!obj || typeof obj !== 'object') return obj
  if (Array.isArray(obj)) return obj.map(stripObject)
  const out = { ...obj }
  for (const key of Object.keys(out)) {
    if (SECRET_KEYS.has(key)) {
      delete out[key]
      continue
    }
    if (out[key] && typeof out[key] === 'object') {
      out[key] = stripObject(out[key])
    }
  }
  return out
}

export function stripSecretsFromStudentRecord(student) {
  return stripObject(student)
}

export function stripSecretsFromFacultyRecord(faculty) {
  return stripObject(faculty)
}

export function stripSecretsFromList(list) {
  if (!Array.isArray(list)) return list
  return list.map((item) => stripObject(item))
}
