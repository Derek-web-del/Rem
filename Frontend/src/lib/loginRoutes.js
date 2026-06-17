export const LOGIN_SELECT_PATH = '/login'

export const ROLE_TO_LOGIN_PATH = {
  INSTITUTE: '/login/institute',
  FACULTY: '/login/faculty',
  STUDENT: '/login/student',
}

/** Visible portal codes in login URLs (?id=1|2|3). */
export const PORTAL_URL_IDS = {
  INSTITUTE: '1',
  FACULTY: '2',
  STUDENT: '3',
}

const LOGIN_PATH_TO_ROLE = Object.fromEntries(
  Object.entries(ROLE_TO_LOGIN_PATH).map(([role, path]) => [path, role]),
)

export function isLoginPath(pathname) {
  const p = normalizeLoginPath(pathname)
  return p === LOGIN_SELECT_PATH || p.startsWith(`${LOGIN_SELECT_PATH}/`)
}

export function normalizeLoginPath(pathname) {
  const p = String(pathname || '')
    .split('?')[0]
    .replace(/\/+$/, '')
  return p || '/'
}

export function roleFromLoginPath(pathname) {
  return LOGIN_PATH_TO_ROLE[normalizeLoginPath(pathname)] || null
}

export function loginViewFromPath(pathname) {
  const p = normalizeLoginPath(pathname)
  if (p === LOGIN_SELECT_PATH) return 'select'
  if (p === `${LOGIN_SELECT_PATH}/forgot-password`) return 'forgot'
  return roleFromLoginPath(pathname) ? 'login' : null
}

/**
 * Build a portal login path with ?id= portal code.
 * @param {string} portalRoleId INSTITUTE | FACULTY | STUDENT
 * @param {Record<string, string>} [extraParams]
 * @returns {string}
 */
export function loginPathWithPortalId(portalRoleId, extraParams = {}) {
  const path = ROLE_TO_LOGIN_PATH[portalRoleId]
  if (!path) return LOGIN_SELECT_PATH
  const portalId = PORTAL_URL_IDS[portalRoleId]
  const params = new URLSearchParams()
  if (portalId) params.set('id', portalId)
  for (const [key, value] of Object.entries(extraParams)) {
    const v = String(value ?? '').trim()
    if (v) params.set(key, v)
  }
  const qs = params.toString()
  return qs ? `${path}?${qs}` : path
}

/**
 * Return corrected search string when a portal login path is missing/wrong ?id=.
 * @param {string} pathname
 * @param {string} [search]
 * @returns {string | null} e.g. "?id=2" or null when OK / not a portal path
 */
export function syncLoginPortalSearch(pathname, search = '') {
  const role = roleFromLoginPath(pathname)
  if (!role) return null
  const expectedId = PORTAL_URL_IDS[role]
  if (!expectedId) return null

  const raw = String(search || '').trim()
  const params = new URLSearchParams(raw.startsWith('?') ? raw.slice(1) : raw)
  if (params.get('id') === expectedId) return null

  params.set('id', expectedId)
  const qs = params.toString()
  return qs ? `?${qs}` : null
}
