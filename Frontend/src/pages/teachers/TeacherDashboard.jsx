import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useNavigate, useOutletContext } from 'react-router-dom'
import { authClient } from '../../lib/auth-client.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, useFacultyNotify } from '../../lib/facultyNotify.js'
import TermsAndConditions, {
  TEACHER_TERMS_ACCEPTED_KEY,
  clearTeacherTermsAcceptance,
  isTeacherTermsAccepted,
} from '../../TermsAndConditions.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import TeacherProfileCard from './TeacherProfileCard.jsx'
import TeacherStatCards from './TeacherStatCards.jsx'
import TeacherAdvisorySections from './TeacherAdvisorySections.jsx'
import {
  buildSessionFallbackFaculty,
  findFacultyForUser,
  findLocalFacultyExclusiveMatch,
  mergeFacultyWithSessionUser,
} from './findFacultyForUser.js'
import { canAccessTeacherDashboard } from './teacherDashboardAccess.js'
import { fetchInstituteAppState, apiUrl, normalizeFacultyShape } from '../../lib/lmsStateStorage.js'
import { facultyPhotoDisplaySrc } from '../../lib/facultyPhoto.js'
import { ACTION_BLUE } from './instituteChrome.js'

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_DISPLAY_NAME || 'Glendale School, Inc.'

function facultyDisplayName(faculty) {
  if (!faculty) return ''
  if (faculty.name) return String(faculty.name).trim()
  return `${faculty.firstName || ''} ${faculty.middleName || ''} ${faculty.lastName || ''}`.replace(/\s+/g, ' ').trim()
}

function formatGradeLabel(raw) {
  const s = String(raw || '').trim()
  if (!s) return '—'
  if (s === '—') return '—'
  if (/^grade\s+/i.test(s)) return s
  if (/^\d+$/.test(s)) return `Grade ${s}`
  return s
}

/** Resolve faculty code from API profile, roster row, or session login username. */
function resolveFacultyCode(apiProfile, effectiveFaculty, sessionUser) {
  const candidates = [
    apiProfile?.faculty_code,
    apiProfile?.employee_id,
    apiProfile?.faculty_username,
    effectiveFaculty?.facultyCode,
    effectiveFaculty?.faculty_code,
    effectiveFaculty?.employee_id,
    effectiveFaculty?.facultyUsername,
    effectiveFaculty?.faculty_username,
    sessionUser?.username,
  ]
  for (const value of candidates) {
    const s = String(value ?? '').trim()
    if (s && s !== '—') return s
  }
  return '—'
}

const DASHBOARD_FETCH_TIMEOUT_MS = 10000

/** Blue banner line under name: grade range / advisory count from API `advisory_sections`. */
function bannerSubtitleFromAdvisory(apiProfile, effectiveFaculty) {
  const sections = apiProfile?.advisory_sections

  const fallbackGrade = () => {
    const g =
      (apiProfile?.grade_level != null && String(apiProfile.grade_level).trim() !== ''
        ? apiProfile.grade_level
        : null) ||
      effectiveFaculty?.grade_level ||
      effectiveFaculty?.grade
    return formatGradeLabel(g || '')
  }

  if (apiProfile == null) {
    return fallbackGrade()
  }

  if (Array.isArray(sections)) {
    if (sections.length === 0) {
      return fallbackGrade()
    }

    if (sections.length === 1) {
      const gl = String(sections[0]?.grade_level || '').trim()
      if (gl) return formatGradeLabel(gl)
      return fallbackGrade()
    }

    const grades = sections
      .map((s) => {
        const g = String(s?.grade_level || '').trim()
        let m = g.match(/^grade\s*(\d+)/i)
        if (m) return Number.parseInt(m[1], 10)
        m = g.match(/^(\d+)$/)
        if (m) return Number.parseInt(m[1], 10)
        return NaN
      })
      .filter((n) => Number.isFinite(n) && n > 0)
      .sort((a, b) => a - b)

    const uniq = [...new Set(grades)]
    if (uniq.length >= 2) {
      return `Grade ${uniq[0]} – ${uniq[uniq.length - 1]}`
    }
    if (uniq.length === 1) {
      return formatGradeLabel(`Grade ${uniq[0]}`)
    }

    return `${sections.length} Advisory Sections`
  }

  return fallbackGrade()
}

export default function TeacherDashboard() {
  const navigate = useNavigate()
  const outlet = useOutletContext() || {}
  const { logoutToPortal: logoutFromLayout, setSidebarNavLocked } = outlet

  const sessionState = authClient.useSession()
  const sessionData = sessionState.data
  const session = sessionData?.session
  const sessionUser = sessionData?.user

  const [state, setState] = useState(null)
  const [stateLoading, setStateLoading] = useState(true)
  const [instituteFetch, setInstituteFetch] = useState({
    loading: true,
    status: 0,
    ok: true,
    source: 'remote',
    message: '',
    detail: '',
  })
  const [termsGateRequired, setTermsGateRequired] = useState(() => !isTeacherTermsAccepted())

  /** GET /api/teacher/profile — `undefined`: not fetched yet; `null`: error / unlinked */
  const [apiProfile, setApiProfile] = useState(undefined)
  const [dashboardStats, setDashboardStats] = useState({
    totalQuery: 0,
    totalAssignment: 0,
    totalActivity: 0,
    totalSections: 0,
  })
  /** GET /api/teacher/advisory-sections — roster + counts from PostgreSQL */
  const [advisorySections, setAdvisorySections] = useState([])
  const [advisoryLoading, setAdvisoryLoading] = useState(true)
  const [advisoryError, setAdvisoryError] = useState(null)
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const sessionUserId = sessionUser?.id ?? sessionUser?.email ?? ''
  const sessionId = session?.id ?? ''

  useEffect(() => {
    setSidebarNavLocked?.(termsGateRequired)
  }, [termsGateRequired, setSidebarNavLocked])

  const logoutToPortal = useCallback(async () => {
    clearTeacherTermsAcceptance()
    await authClient.signOut()
    navigate('/login', { replace: true })
  }, [navigate])

  const logout = logoutFromLayout || logoutToPortal

  useEffect(() => {
    if (!sessionId || termsGateRequired) {
      setStateLoading(false)
      return
    }
    let cancelled = false
    let timedOut = false
    const timeoutId = setTimeout(() => {
      if (cancelled) return
      timedOut = true
      setStateLoading(false)
      setInstituteFetch((prev) => ({
        ...prev,
        loading: false,
        ok: false,
        message: 'Failed to load institute roster.',
      }))
    }, DASHBOARD_FETCH_TIMEOUT_MS)

    async function load() {
      setStateLoading(true)
      setInstituteFetch((prev) => ({ ...prev, loading: true }))
      const result = await fetchInstituteAppState()
      if (cancelled || timedOut) return
      setState(result.state)
      setInstituteFetch({
        loading: false,
        status: result.status,
        ok: result.ok,
        source: result.source,
        message: result.message || '',
        detail: result.detail || '',
      })
      setStateLoading(false)
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [sessionId, termsGateRequired])

  useEffect(() => {
    if (!sessionUserId || termsGateRequired) {
      setAdvisoryLoading(false)
      return
    }

    let cancelled = false
    let timedOut = false

    setAdvisoryLoading(true)
    setAdvisoryError(null)

    const timeoutId = setTimeout(() => {
      if (cancelled) return
      timedOut = true
      setAdvisoryLoading(false)
      setAdvisoryError('Failed to load data.')
      toastRef.current.error(FACULTY_MSG.dashboard.loadFailed, {
        toastId: FACULTY_TOAST_ID.dashboardFetchError,
      })
    }, DASHBOARD_FETCH_TIMEOUT_MS)

    ;(async () => {
      let fetchFailed = false
      try {
        const [resProf, resStats, resAdv] = await Promise.all([
          fetch(apiUrl('/api/teacher/profile'), { credentials: 'include' }),
          fetch(apiUrl('/api/teacher/dashboard-stats'), { credentials: 'include' }),
          fetch(apiUrl('/api/teacher/advisory-sections'), { credentials: 'include' }),
        ])
        const dataProf = await resProf.json().catch(() => ({}))
        const dataStats = await resStats.json().catch(() => ({}))
        const dataAdvRaw = await resAdv.json().catch(() => null)

        console.log('[TeacherDashboard] profile response:', dataProf)
        console.log('[TeacherDashboard] dashboard-stats response:', dataStats)
        console.log('[TeacherDashboard] advisory-sections response:', dataAdvRaw)

        if (cancelled || timedOut) return

        if (
          resProf.ok &&
          dataProf &&
          !dataProf.error &&
          String(dataProf.faculty_row_id || dataProf.id || '').trim() !== ''
        ) {
          setApiProfile(dataProf)
        } else {
          setApiProfile(null)
          if (!resProf.ok) {
            console.error('[TeacherDashboard] profile fetch error:', dataProf)
            fetchFailed = true
          }
        }

        if (resStats.ok && dataStats != null && typeof dataStats === 'object') {
          setDashboardStats({
            totalQuery:
              typeof dataStats.totalQuery === 'number'
                ? dataStats.totalQuery
                : Number.parseInt(String(dataStats.totalQuery ?? 0), 10) || 0,
            totalAssignment:
              typeof dataStats.totalAssignment === 'number'
                ? dataStats.totalAssignment
                : Number.parseInt(String(dataStats.totalAssignment ?? 0), 10) || 0,
            totalActivity:
              typeof dataStats.totalActivity === 'number'
                ? dataStats.totalActivity
                : Number.parseInt(String(dataStats.totalActivity ?? 0), 10) || 0,
            totalSections:
              typeof dataStats.totalSections === 'number'
                ? dataStats.totalSections
                : Number.parseInt(String(dataStats.totalSections ?? 0), 10) || 0,
          })
        } else if (!resStats.ok) {
          console.error('[TeacherDashboard] dashboard-stats fetch error:', dataStats)
          fetchFailed = true
        }

        if (resAdv.ok && Array.isArray(dataAdvRaw)) {
          setAdvisorySections(dataAdvRaw)
          setAdvisoryError(null)
        } else {
          setAdvisorySections([])
          const msg =
            dataAdvRaw && typeof dataAdvRaw === 'object'
              ? String(dataAdvRaw.message || dataAdvRaw.error || '').trim()
              : ''
          const errMsg = msg || `Failed to load advisory sections (${resAdv.status}).`
          console.error('[TeacherDashboard] advisory-sections fetch error:', errMsg)
          setAdvisoryError(errMsg)
          fetchFailed = true
        }

        if (fetchFailed) {
          toastRef.current.error(FACULTY_MSG.dashboard.loadFailed, {
            toastId: FACULTY_TOAST_ID.dashboardFetchError,
          })
        }
      } catch (e) {
        if (!cancelled && !timedOut) {
          const msg = String(e?.message || e || 'Failed to load dashboard data.')
          console.error('[TeacherDashboard] fetch error:', msg)
          setApiProfile(null)
          setAdvisorySections([])
          setAdvisoryError(msg)
          toastRef.current.error(FACULTY_MSG.dashboard.loadFailed, {
            toastId: FACULTY_TOAST_ID.dashboardFetchError,
          })
        }
      } finally {
        clearTimeout(timeoutId)
        if (!cancelled && !timedOut) setAdvisoryLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
      setAdvisoryLoading(false)
    }
  }, [sessionUserId, termsGateRequired])

  const faculties = useMemo(() => (Array.isArray(state?.faculties) ? state.faculties : []), [state])

  const instituteFaculty = useMemo(() => {
    const offline =
      instituteFetch.source === 'unavailable' ||
      instituteFetch.source === 'error' ||
      instituteFetch.source === 'network'
    let f = findFacultyForUser(faculties, sessionUser)
    if (!f) f = findLocalFacultyExclusiveMatch(faculties, sessionUser)
    if (!f && offline) f = buildSessionFallbackFaculty(sessionUser)
    return mergeFacultyWithSessionUser(f, sessionUser)
  }, [faculties, sessionUser, instituteFetch.source])

  /** Prefer PostgreSQL-linked profile from `/api/teacher/profile` when present (object after fetch). */
  const effectiveFaculty = useMemo(() => {
    const id = apiProfile?.faculty_row_id ?? apiProfile?.id
    const hasApi = apiProfile != null && !!String(id || '').trim()
    if (!hasApi) return instituteFaculty
    const hydrated = normalizeFacultyShape({
      id: String(id).trim(),
      name: apiProfile?.name ?? '',
      firstName: apiProfile.first_name,
      lastName: apiProfile.last_name,
      middleName: apiProfile.middle_name ?? '',
      first_name: apiProfile.first_name,
      last_name: apiProfile.last_name,
      employee_id: apiProfile.employee_id ?? apiProfile.faculty_code,
      faculty_code: apiProfile.faculty_code ?? apiProfile.employee_id,
      faculty_username: apiProfile.faculty_username ?? apiProfile.faculty_code ?? apiProfile.employee_id,
      qualification: apiProfile.specialization ?? '',
      specialization: apiProfile.specialization ?? '',
      contactNumber: apiProfile.contact_number ?? '',
      contact_number: apiProfile.contact_number ?? '',
      email: apiProfile.email ?? '',
      photo_url: apiProfile.photo_url ?? '',
      photoDataUrl: apiProfile.photo_url ?? '',
      grade_level: apiProfile.grade_level ?? '',
      grade: apiProfile.grade_level ?? '',
      advisory_sections: apiProfile.advisory_sections,
    })
    return mergeFacultyWithSessionUser(hydrated, sessionUser)
  }, [apiProfile, instituteFaculty, sessionUser])

  const allowed = useMemo(() => canAccessTeacherDashboard(sessionUser), [sessionUser])

  const displayName = useMemo(() => {
    if (apiProfile != null) {
      const fromParts = `${String(apiProfile.first_name || '').trim()} ${String(apiProfile.last_name || '').trim()}`.trim()
      if (fromParts) return fromParts
      if (apiProfile.name) return String(apiProfile.name).trim()
    }
    if (effectiveFaculty) return facultyDisplayName(effectiveFaculty) || sessionUser?.name || 'Faculty'
    return sessionUser?.name || sessionUser?.email || 'Faculty'
  }, [apiProfile, effectiveFaculty, sessionUser])

  const bannerSubtitle = useMemo(
    () => bannerSubtitleFromAdvisory(apiProfile, effectiveFaculty),
    [apiProfile, effectiveFaculty],
  )

  /** Stat card uses live advisory API count after load; falls back to stats API while loading */
  const totalAdvisorySections = advisoryLoading
    ? dashboardStats.totalSections > 0
      ? dashboardStats.totalSections
      : null
    : advisorySections.length

  const facultyCode = resolveFacultyCode(apiProfile, effectiveFaculty, sessionUser)

  const qualification =
    (apiProfile?.specialization ? String(apiProfile.specialization).trim() : '') ||
    String(effectiveFaculty?.qualification || '').trim() ||
    String(sessionUser?.facultyQualification || '').trim() ||
    '—'

  const contactNumber =
    (apiProfile?.contact_number ? String(apiProfile.contact_number).trim() : '') ||
    String(effectiveFaculty?.contactNumber || effectiveFaculty?.contact_number || '').trim() ||
    String(sessionUser?.facultyContactNumber || '').trim() ||
    '—'

  const email =
    (apiProfile?.email ? String(apiProfile.email).trim() : '') ||
    effectiveFaculty?.email ||
    sessionUser?.email ||
    '—'

  const photoResolved = facultyPhotoDisplaySrc(
    apiProfile?.photo_url || effectiveFaculty?.photo_url || effectiveFaculty?.photoDataUrl,
    { apiUrlFn: apiUrl },
  )

  const roleLabel = useMemo(() => {
    const r = String(sessionUser?.role || '').toLowerCase()
    if (r === 'admin') return 'Role: Administrator'
    if (r === 'teacher') return 'Role: Teacher'
    if (r === 'faculty') return 'Role: Faculty'
    if (r === 'student') return 'Role: Student'
    if (r === 'user') return 'Role: Faculty'
    if (sessionUser?.role) return `Role: ${String(sessionUser.role)}`
    return ''
  }, [sessionUser])

  if (!session) {
    return <Navigate to="/login" replace />
  }

  if (!allowed) {
    return (
      <div
        className="flex h-svh min-h-0 flex-col items-center justify-center gap-4 overflow-hidden bg-neutral-100 px-4 text-center font-[Inter,system-ui,sans-serif]"
        style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
      >
        <p className="max-w-md text-sm font-medium text-neutral-700">
          You do not have access to the faculty dashboard. Sign in with a teacher or faculty account.
        </p>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={() => navigate('/login', { replace: true })}
        >
          Back to sign-in
        </button>
      </div>
    )
  }

  if (termsGateRequired) {
    return (
      <>
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-neutral-200/80 bg-neutral-50/80 px-4 py-3 backdrop-blur-sm md:px-8">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">FACULTY</p>
            <h1 className="mt-0.5 text-lg font-bold tracking-tight text-neutral-900 md:text-xl">
              Terms and Policy
            </h1>
          </div>
          <button
            type="button"
            onClick={logout}
            className="rounded-lg px-5 py-2 text-sm font-semibold text-white shadow-md transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{ backgroundColor: ACTION_BLUE }}
          >
            Logout
          </button>
        </header>
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
          <div className="mx-auto w-full max-w-4xl pb-8">
            <TermsAndConditions
              schoolName={SCHOOL_NAME}
              gateMode
              acceptanceStorageKey={TEACHER_TERMS_ACCEPTED_KEY}
              onAccepted={() => {
                setTermsGateRequired(false)
              }}
            />
          </div>
        </main>
      </>
    )
  }

  return (
    <>
      <TeacherMainHeader onLogout={logout} pageTitle="Dashboard" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        {stateLoading ? (
          <p className="text-sm font-medium text-neutral-600">Loading institute roster from `/api/v1/state`…</p>
        ) : null}

        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
          <div className="space-y-6">
            <TeacherProfileCard
              displayName={displayName}
              gradeLabel={bannerSubtitle}
              roleLabel={roleLabel}
              photoDataUrl={photoResolved}
              facultyCode={facultyCode}
              qualification={qualification}
              contactNumber={contactNumber}
              email={email}
            />
            <TeacherStatCards
              totalQuery={dashboardStats.totalQuery}
              totalAssignment={dashboardStats.totalAssignment}
              totalActivity={dashboardStats.totalActivity}
              totalSections={totalAdvisorySections}
            />
            <TeacherAdvisorySections
              sections={advisorySections}
              loading={advisoryLoading}
              error={advisoryError}
            />
          </div>
        </section>
      </main>
    </>
  )
}
