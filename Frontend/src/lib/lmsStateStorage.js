/**
 * Mirrors `InstituteDashboard` bootstrap: GET `/api/v1/state` when available,
 * otherwise read the same `localStorage` keys the admin UI persists to.
 *
 * When the UI runs on a different origin than the API (e.g. Vite on localhost while
 * Better Auth + API are on ngrok), set `VITE_AUTH_BASE_URL` to the same origin as
 * `BETTER_AUTH_URL` (no trailing slash), or set `VITE_LMS_API_BASE_URL` if you need
 * a different base for LMS state only.
 *
 * Optional: `VITE_LMS_STATE_FETCH_MS` — max wait for GET `/api/v1/state` from the browser (default 8000).
 * Prevents the faculty dashboard from hanging when the API or database is slow or unreachable.
 */

const FACULTY_STORAGE_KEY = 'lenlearn.faculties'
const SUBJECT_STORAGE_KEY = 'lenlearn.subjects'
const UPDATE_STORAGE_KEY = 'lenlearn.updates'

function readJsonArray(key) {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function readLocalSnapshot() {
  return {
    faculties: readJsonArray(FACULTY_STORAGE_KEY),
    subjects: readJsonArray(SUBJECT_STORAGE_KEY),
    updates: readJsonArray(UPDATE_STORAGE_KEY),
  }
}

/** Normalize a faculty row from API / localStorage (camelCase + legacy snake_case). */
export function normalizeFacultyShape(f) {
  if (!f || typeof f !== 'object') return f
  const {
    password_hash: _ph,
    password: _pw,
    raw_password_placeholder: _rp,
    app_password_gmail: _ag,
    app_password: _ap,
    appPassword: _apc,
    appPasswordGmail: _apg,
    ...rest
  } = f
  return {
    ...rest,
    contactNumber: rest.contactNumber ?? rest.contact_number ?? '',
    specialization: String(rest.specialization ?? '').trim(),
    qualification:
      rest.qualification != null && rest.qualification !== ''
        ? rest.qualification
        : String(rest.specialization ?? '').trim(),
    facultyUsername:
      rest.facultyUsername ??
      rest.faculty_username ??
      rest.username ??
      (rest.employee_id != null ? String(rest.employee_id) : ''),
    facultyCode:
      rest.facultyCode ??
      rest.faculty_code ??
      (rest.employee_id != null ? String(rest.employee_id) : '') ??
      '',
    authUserId: rest.authUserId ?? rest.auth_user_id ?? '',
    photo_url: String(rest.photo_url ?? rest.photoDataUrl ?? rest.photo_data_url ?? '').trim(),
    photoDataUrl: String(rest.photo_url ?? rest.photoDataUrl ?? rest.photo_data_url ?? '').trim(),
    grade_level: String(rest.grade_level ?? rest.gradeLevel ?? rest.grade ?? '').trim(),
    grade: String(rest.grade_level ?? rest.gradeLevel ?? rest.grade ?? '').trim(),
    password: '',
    appPassword: '',
  }
}

function normLoginKey(f) {
  const u = String(f?.facultyUsername ?? f?.faculty_username ?? f?.username ?? '').trim().toLowerCase()
  const c = String(f?.facultyCode ?? f?.faculty_code ?? '').trim().toLowerCase()
  return u || c || ''
}

/**
 * Remote `app_state` can lag behind or omit fields that exist in the browser snapshot
 * (`lenlearn.faculties`). Merge so teachers still see qualification / contact on the dashboard.
 */
function mergeFacultyLists(remote, local) {
  const rem = Array.isArray(remote) ? remote : []
  const loc = Array.isArray(local) ? local : []
  if (rem.length === 0) return []
  if (loc.length === 0) return rem.map((f) => normalizeFacultyShape(f))

  const byId = new Map()
  const byLogin = new Map()
  for (const raw of loc) {
    const l = normalizeFacultyShape(raw)
    const id = String(l.id || '').trim()
    if (id) byId.set(id, l)
    const key = normLoginKey(l)
    if (key) byLogin.set(key, l)
  }

  const pick = (primary, fallback) => {
    const p = String(primary ?? '').trim()
    if (p) return p
    const fb = String(fallback ?? '').trim()
    return fb || ''
  }

  return rem.map((raw) => {
    const r = normalizeFacultyShape(raw)
    const id = String(r.id || '').trim()
    const login = normLoginKey(r)
    const l = (id && byId.get(id)) || (login && byLogin.get(login)) || null
    if (!l) return r
    return {
      ...l,
      ...r,
      qualification: pick(r.qualification, l.qualification),
      contactNumber: pick(r.contactNumber, l.contactNumber),
      photoDataUrl: pick(r.photoDataUrl, l.photoDataUrl),
      grade: pick(r.grade, l.grade),
    }
  })
}

/** Merge remote `app_state` JSON with browser snapshot (same rules as dashboard bootstrap). */
function buildMergedAppState(remote, local) {
  const loc = local && typeof local === 'object' ? local : readLocalSnapshot()
  if (!remote || typeof remote !== 'object') {
    return {
      faculties: Array.isArray(loc.faculties) ? loc.faculties.map((f) => normalizeFacultyShape(f)) : [],
      subjects: Array.isArray(loc.subjects) ? loc.subjects : [],
      updates: Array.isArray(loc.updates) ? loc.updates : [],
      sections: [],
      students: [],
      curriculums: [],
      adminAvatarDataUrl: '',
    }
  }

  const faculties = mergeFacultyLists(
    Array.isArray(remote.faculties) ? remote.faculties : [],
    loc.faculties,
  )
  const subjects =
    Array.isArray(remote.subjects) && remote.subjects.length > 0 ? remote.subjects : loc.subjects
  const updates =
    Array.isArray(remote.updates) && remote.updates.length > 0 ? remote.updates : loc.updates

  return {
    ...remote,
    faculties,
    subjects,
    updates,
  }
}

function normalizeApiBase(url) {
  const s = String(url || '').trim()
  if (!s) return ''
  return s.replace(/\/+$/, '')
}

/** Avoid hanging the faculty dashboard when the API or database is slow or unreachable. */
const LMS_STATE_FETCH_MS = Number(import.meta.env.VITE_LMS_STATE_FETCH_MS || 8000)

function fetchWithTimeout(url, options = {}) {
  const ms = Number.isFinite(LMS_STATE_FETCH_MS) && LMS_STATE_FETCH_MS > 0 ? LMS_STATE_FETCH_MS : 8000
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  const { signal: _ignored, ...rest } = options
  return fetch(url, { ...rest, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

/**
 * When the UI origin differs from the API (e.g. Vite on localhost, Express on ngrok), set
 * `VITE_AUTH_BASE_URL` (or `VITE_LMS_API_BASE_URL`) to the API origin — same as `auth-client.js`.
 */
export function getResolvedApiOrigin() {
  return normalizeApiBase(import.meta.env.VITE_LMS_API_BASE_URL || import.meta.env.VITE_AUTH_BASE_URL || '')
}

/** Absolute or same-origin path for `/api/auth/*` and other API calls from plain `fetch`. */
export function apiUrl(path) {
  const p = String(path || '').trim()
  const withSlash = p.startsWith('/') ? p : `/${p}`
  const base = getResolvedApiOrigin()
  return base ? `${base}${withSlash}` : withSlash
}

/**
 * Full URL for GET/PUT `/api/v1/state`. Relative when no env base is set (Vite proxy).
 */
export function getLmsStateEndpointUrl() {
  const base = normalizeApiBase(
    import.meta.env.VITE_LMS_API_BASE_URL || import.meta.env.VITE_AUTH_BASE_URL || '',
  )
  if (!base) return '/api/v1/state'
  return `${base}/api/v1/state`
}

/**
 * Fetch `/api/v1/state` with explicit HTTP status for teacher dashboard error handling.
 *
 * @returns {Promise<{
 *   status: number,
 *   ok: boolean,
 *   source: 'remote' | 'unavailable' | 'error' | 'network',
 *   message: string,
 *   detail: string,
 *   state: object,
 * }>}
 */
export async function fetchInstituteAppState() {
  const local = readLocalSnapshot()
  const url = getLmsStateEndpointUrl()

  try {
    const res = await fetchWithTimeout(url, { credentials: 'include' })
    const payload = await res.json().catch(() => ({}))

    if (res.status === 503) {
      const msg =
        payload?.message ||
        payload?.error ||
        'Institute records are temporarily unavailable. Your sign-in still works.'
      const detail = String(payload?.detail || '').trim()
      return {
        status: 503,
        ok: false,
        source: 'unavailable',
        message: String(msg),
        detail,
        state: buildMergedAppState(null, local),
      }
    }

    if (!res.ok) {
      return {
        status: res.status,
        ok: false,
        source: 'error',
        message: String(payload?.message || payload?.error || `Institute state request failed (${res.status}).`),
        detail: String(payload?.detail || '').trim(),
        state: buildMergedAppState(null, local),
      }
    }

    const remote = payload?.state
    if (!remote || typeof remote !== 'object') {
      return {
        status: 200,
        ok: true,
        source: 'remote',
        message: '',
        detail: '',
        state: buildMergedAppState(null, local),
      }
    }

    return {
      status: 200,
      ok: true,
      source: 'remote',
      message: '',
      detail: '',
      state: buildMergedAppState(remote, local),
    }
  } catch (e) {
    const aborted = e?.name === 'AbortError'
    return {
      status: 0,
      ok: false,
      source: 'network',
      message: aborted
        ? `Request timed out after ${LMS_STATE_FETCH_MS}ms (institute server may be slow or unreachable). Showing saved browser data.`
        : String(e?.message || e || 'Network error loading institute state.'),
      detail: '',
      state: buildMergedAppState(null, local),
    }
  }
}

/**
 * @returns {Promise<{ source: 'remote' | 'local' | 'merged', state: object }>}
 */
export async function loadLmsAppState() {
  const local = readLocalSnapshot()

  try {
    const res = await fetchWithTimeout(getLmsStateEndpointUrl(), { credentials: 'include' })
    const payload = await res.json().catch(() => ({}))

    if (!res.ok) {
      return { source: 'local', state: local }
    }

    const remote = payload?.state
    if (!remote || typeof remote !== 'object') {
      return { source: 'local', state: local }
    }

    const state = buildMergedAppState(remote, local)
    const mergedFromLocal =
      (Array.isArray(remote.faculties) && remote.faculties.length === 0 && local.faculties.length > 0) ||
      (Array.isArray(remote.faculties) &&
        remote.faculties.length > 0 &&
        local.faculties.length > 0) ||
      (Array.isArray(remote.subjects) && remote.subjects.length === 0 && local.subjects.length > 0) ||
      (Array.isArray(remote.updates) && remote.updates.length === 0 && local.updates.length > 0)

    return {
      source: mergedFromLocal ? 'merged' : 'remote',
      state,
    }
  } catch {
    return { source: 'local', state: local }
  }
}
