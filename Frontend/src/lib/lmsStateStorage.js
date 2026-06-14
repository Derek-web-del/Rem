// TODO: migrate to apiFetch from ./apiClient.js
/**
 * Institute bootstrap via GET `/api/v1/state` (PostgreSQL only — no roster localStorage fallback).
 *
 * When the UI runs on a different origin than the API, set `VITE_AUTH_BASE_URL` or
 * `VITE_LMS_API_BASE_URL` to the API origin (same as `auth-client.js`).
 */

const EMPTY_STATE = {
  faculties: [],
  subjects: [],
  updates: [],
  sections: [],
  students: [],
  curriculums: [],
  adminAvatarDataUrl: '',
}

/** Normalize a faculty row from API (camelCase + legacy snake_case). */
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

function normalizeRemoteState(remote) {
  if (!remote || typeof remote !== 'object') return { ...EMPTY_STATE }
  const faculties = Array.isArray(remote.faculties)
    ? remote.faculties.map((f) => normalizeFacultyShape(f))
    : []
  return {
    ...EMPTY_STATE,
    ...remote,
    faculties,
    subjects: Array.isArray(remote.subjects) ? remote.subjects : [],
    updates: Array.isArray(remote.updates) ? remote.updates : [],
    sections: Array.isArray(remote.sections) ? remote.sections : [],
    students: Array.isArray(remote.students) ? remote.students : [],
    curriculums: Array.isArray(remote.curriculums) ? remote.curriculums : [],
  }
}

function normalizeApiBase(url) {
  const s = String(url || '').trim()
  if (!s) return ''
  return s.replace(/\/+$/, '')
}

const LMS_STATE_FETCH_MS = Number(import.meta.env.VITE_LMS_STATE_FETCH_MS || 8000)

function fetchWithTimeout(url, options = {}) {
  const ms = Number.isFinite(LMS_STATE_FETCH_MS) && LMS_STATE_FETCH_MS > 0 ? LMS_STATE_FETCH_MS : 8000
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  const { signal: _ignored, ...rest } = options
  return fetch(url, { ...rest, signal: ctrl.signal }).finally(() => clearTimeout(t))
}

export function getResolvedApiOrigin() {
  return normalizeApiBase(import.meta.env.VITE_LMS_API_BASE_URL || import.meta.env.VITE_AUTH_BASE_URL || '')
}

export function apiUrl(path) {
  const p = String(path || '').trim()
  const withSlash = p.startsWith('/') ? p : `/${p}`
  const base = getResolvedApiOrigin()
  return base ? `${base}${withSlash}` : withSlash
}

export function getLmsStateEndpointUrl() {
  const base = normalizeApiBase(
    import.meta.env.VITE_LMS_API_BASE_URL || import.meta.env.VITE_AUTH_BASE_URL || '',
  )
  if (!base) return '/api/v1/state'
  return `${base}/api/v1/state`
}

export async function fetchInstituteAppState() {
  const url = getLmsStateEndpointUrl()

  try {
    const res = await fetchWithTimeout(url, { credentials: 'include' })
    const payload = await res.json().catch(() => ({}))

    if (res.status === 503) {
      return {
        status: 503,
        ok: false,
        source: 'unavailable',
        message: String(
          payload?.message ||
            payload?.error ||
            'Institute records are temporarily unavailable. Your sign-in still works.',
        ),
        detail: String(payload?.detail || '').trim(),
        state: { ...EMPTY_STATE },
      }
    }

    if (!res.ok) {
      return {
        status: res.status,
        ok: false,
        source: 'error',
        message: String(payload?.message || payload?.error || `Institute state request failed (${res.status}).`),
        detail: String(payload?.detail || '').trim(),
        state: { ...EMPTY_STATE },
      }
    }

    const remote = payload?.state
    return {
      status: 200,
      ok: true,
      source: 'remote',
      message: '',
      detail: '',
      state: normalizeRemoteState(remote),
    }
  } catch (e) {
    const aborted = e?.name === 'AbortError'
    return {
      status: 0,
      ok: false,
      source: 'network',
      message: aborted
        ? `Request timed out after ${LMS_STATE_FETCH_MS}ms (institute server may be slow or unreachable).`
        : String(e?.message || e || 'Network error loading institute state.'),
      detail: '',
      state: { ...EMPTY_STATE },
    }
  }
}

/** @returns {Promise<{ source: 'remote' | 'error', state: object }>} */
export async function loadLmsAppState() {
  const result = await fetchInstituteAppState()
  return {
    source: result.ok ? 'remote' : 'error',
    state: result.state,
  }
}
