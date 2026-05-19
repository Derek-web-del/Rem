export const LOGIN_SELECT_PATH = '/login'

export const ROLE_TO_LOGIN_PATH = {
  INSTITUTE: '/login/institute',
  FACULTY: '/login/faculty',
  STUDENT: '/login/student',
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
  return roleFromLoginPath(pathname) ? 'login' : null
}
