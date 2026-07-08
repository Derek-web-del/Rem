import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { fetchTeacherAdvisorySections } from '../../lib/teacherPortalOffline.js'
import { isOnline } from '../../lib/offlineSync.js'
import { formatSemesterLabel } from '../../lib/quizQuestionTypes.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, useFacultyNotify } from '../../lib/facultyNotify.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import { studentPhotoDisplaySrc } from '../../lib/studentPhoto.js'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE, SIDEBAR_GOLD, SIDEBAR_GOLD_DARK } from './instituteChrome.js'

function studentDisplayName(st) {
  if (st?.name) return String(st.name).trim()
  return [st?.last_name, st?.first_name, st?.middle_name]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(', ')
    .replace(/^,\s*|,\s*$/g, '')
    .trim() || '—'
}

function displayEnrollment(st) {
  const en = String(st?.enrollment_no ?? '').trim()
  return en || '—'
}

function displayRoll(st) {
  const roll = String(st?.roll_no ?? '').trim()
  return roll || '—'
}

function displayPhone(st) {
  const phone = String(st?.contact_no ?? '').trim()
  return phone || '—'
}

function displaySemester(st) {
  return formatSemesterLabel(st?.semester) || '—'
}

function ViewPageHeading({ label, title, backTo }) {
  return (
    <div className="space-y-0.5">
      <TeacherBackButton className="mb-0" to={backTo} />
      <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{label}</p>
      <h2 className="text-xl font-bold leading-tight text-neutral-900 md:text-2xl">{title}</h2>
    </div>
  )
}

function SectionsListView({ sections, loading, error, onViewStudents }) {
  const count = sections.length

  if (loading) {
    return (
      <div className="py-16 text-center text-sm text-neutral-500" role="status">
        Loading sections…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
        {error}
      </div>
    )
  }

  return (
    <>
      <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-1.5 text-sm font-medium text-neutral-800 shadow-sm">
        <span>Assigned Sections</span>
        <span
          className="rounded-full px-2 py-0.5 text-xs font-bold text-white"
          style={{ backgroundColor: ACTION_BLUE }}
        >
          {count}
        </span>
      </div>

      <section className="mt-2 rounded-xl border border-neutral-100 bg-white p-4 shadow-md">
        <h3 className="text-lg font-bold leading-tight text-neutral-900">Sections You Handle</h3>
        <p className="mt-0.5 text-sm text-neutral-600">
          Click on any section to view students in that section
        </p>

        {count === 0 ? (
          <div className="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-10 text-center text-sm text-neutral-600">
            No advisory sections currently assigned.
          </div>
        ) : (
          <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {sections.map((section) => {
              const total =
                typeof section.total_students === 'number'
                  ? section.total_students
                  : Array.isArray(section.students)
                    ? section.students.length
                    : 0
              const grade = String(section.grade_level ?? '').trim() || '—'
              const name = String(section.name ?? '').trim() || '—'
              return (
                <article
                  key={section.id}
                  className="flex flex-col rounded-xl border border-neutral-200 bg-neutral-50/80 p-5 shadow-sm"
                >
                  <div className="flex justify-center py-4">
                    <div
                      className="flex size-14 items-center justify-center rounded-full text-white"
                      style={{ backgroundColor: ACTION_BLUE }}
                    >
                      <i className="ti ti-users text-2xl" aria-hidden="true" />
                    </div>
                  </div>
                  <h4 className="text-center text-lg font-bold text-neutral-900">{name}</h4>
                  <p className="mt-1 text-center text-sm text-neutral-500">{grade}</p>
                  <div className="mt-3 flex justify-center">
                    <span
                      className="rounded-full px-3 py-1 text-xs font-semibold text-white"
                      style={{ backgroundColor: ACTION_BLUE }}
                    >
                      {total} {total === 1 ? 'Student' : 'Students'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onViewStudents(section.id)}
                    className="mt-5 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white"
                    style={{ backgroundColor: SIDEBAR_GOLD_DARK }}
                  >
                    <i className="ti ti-eye" aria-hidden="true" />
                    View Students
                  </button>
                </article>
              )
            })}
          </div>
        )}
      </section>
    </>
  )
}

function SectionStudentsView({ section, search, setSearch, sortRollAsc, setSortRollAsc, onViewStudent, backTo }) {
  const students = useMemo(() => {
    let list = Array.isArray(section?.students) ? [...section.students] : []
    const q = search.trim().toLowerCase()
    if (q) {
      list = list.filter((st) => {
        const name = studentDisplayName(st).toLowerCase()
        const roll = String(st.roll_no ?? '').toLowerCase()
        const en = String(st.enrollment_no ?? '').toLowerCase()
        return name.includes(q) || roll.includes(q) || en.includes(q)
      })
    }
    list.sort((a, b) => {
      const ra = String(a.roll_no ?? '')
      const rb = String(b.roll_no ?? '')
      const na = Number.parseInt(ra, 10)
      const nb = Number.parseInt(rb, 10)
      if (Number.isFinite(na) && Number.isFinite(nb)) {
        return sortRollAsc ? na - nb : nb - na
      }
      return sortRollAsc ? ra.localeCompare(rb) : rb.localeCompare(ra)
    })
    return list
  }, [section, search, sortRollAsc])

  const total =
    typeof section?.total_students === 'number'
      ? section.total_students
      : Array.isArray(section?.students)
        ? section.students.length
        : 0
  const sectionName = String(section?.name ?? '').trim() || '—'
  const grade = String(section?.grade_level ?? '').trim() || '—'

  return (
    <>
      <ViewPageHeading label="VIEW" title="Students Section" backTo={backTo} />

      <div
        className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4 text-white shadow-md"
        style={{ background: `linear-gradient(90deg, ${SIDEBAR_GOLD} 0%, ${SIDEBAR_GOLD_DARK} 100%)` }}
      >
        <div>
          <p className="text-lg font-bold">{sectionName}</p>
          <p className="text-sm text-white/85">{grade}</p>
        </div>
        <div className="text-right">
          <p className="text-3xl font-bold tabular-nums">{total}</p>
          <p className="text-sm text-white/85">Total Students</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <i
            className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
            aria-hidden="true"
          />
          <input
            type="search"
            placeholder="Search students..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 py-2 pl-10 pr-3 text-sm outline-none ring-blue-500/30 focus-visible:ring-2"
          />
        </div>
        <p className="text-sm font-medium text-neutral-600">
          {students.length} student{students.length === 1 ? '' : 's'} in this section
        </p>
      </div>

      <div className="mt-4 overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-neutral-200 bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-600">
            <tr>
              <th className="px-3 py-3">#</th>
              <th className="px-3 py-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1 hover:text-neutral-900"
                  onClick={() => setSortRollAsc((v) => !v)}
                >
                  Roll No.
                  <i className={`ti ti-chevron-${sortRollAsc ? 'up' : 'down'}`} aria-hidden="true" />
                </button>
              </th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Enrollment No.</th>
              <th className="px-3 py-3">Section</th>
              <th className="px-3 py-3">Phone</th>
              <th className="px-3 py-3">Semester</th>
              <th className="px-3 py-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {students.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-10 text-center text-neutral-500">
                  No students found.
                </td>
              </tr>
            ) : (
              students.map((st, index) => {
                const photo = studentPhotoDisplaySrc(st.photo_url)
                return (
                  <tr key={st.id} className="border-b border-neutral-100 last:border-0">
                    <td className="px-3 py-3 text-neutral-500">{index + 1}</td>
                    <td className="px-3 py-3 tabular-nums">{displayRoll(st)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        {photo ? (
                          <AuthenticatedImage
                            src={photo}
                            alt=""
                            className="size-8 rounded-full object-cover"
                            fallback={
                              <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-xs font-bold text-sky-800">
                                ?
                              </div>
                            }
                          />
                        ) : (
                          <div className="flex size-8 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-800">
                            {String(st.first_name?.[0] || '').toUpperCase()}
                            {String(st.last_name?.[0] || '').toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-neutral-900">{studentDisplayName(st)}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3">{displayEnrollment(st)}</td>
                    <td className="px-3 py-3">{st.section || st.section_name || sectionName}</td>
                    <td className="px-3 py-3">{displayPhone(st)}</td>
                    <td className="px-3 py-3">{displaySemester(st)}</td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => onViewStudent(st.id)}
                        className="inline-flex items-center gap-1 rounded-md bg-teal-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-teal-700"
                      >
                        <i className="ti ti-eye" aria-hidden="true" />
                        View
                      </button>
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

export default function TeacherSectionsPage() {
  const navigate = useNavigate()
  const { sectionId } = useParams()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const hasFetched = useRef(false)

  const [sections, setSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const [search, setSearch] = useState('')
  const [sortRollAsc, setSortRollAsc] = useState(true)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const loadSections = async () => {
      setLoading(true)
      setError(null)
      try {
        const offline = !isOnline()
        const list = await fetchTeacherAdvisorySections()
        setSections(list)
        setFromCache(offline)
      } catch (e) {
        const msg = String(e?.message || e)
        console.error('[TeacherSectionsPage] fetch error:', msg)
        setSections([])
        setError(msg)
        toastRef.current.error(FACULTY_MSG.sections.loadFailed, {
          toastId: FACULTY_TOAST_ID.sectionsFetchError,
        })
      } finally {
        setLoading(false)
      }
    }

    void loadSections()
  }, [])

  const activeSection = useMemo(() => {
    if (!sectionId) return null
    return sections.find((s) => String(s.id) === String(sectionId)) || null
  }, [sections, sectionId])

  const isStudentListView = Boolean(sectionId)

  return (
    <>
      <TeacherMainHeader pageTitle="Sections" />
      <main
        className={
          isStudentListView
            ? 'min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8'
            : 'min-h-0 flex-1 space-y-2 overflow-y-auto overflow-x-hidden px-4 pb-4 pt-2 md:px-8 md:pb-6 md:pt-3'
        }
      >
        {isStudentListView ? (
          loading ? (
            <div className="py-16 text-center text-sm text-neutral-500">Loading…</div>
          ) : !activeSection ? (
            <>
              <ViewPageHeading
                label="VIEW"
                title="Students Section"
                backTo="/teacher/sections"
              />
              <p className="mt-4 text-sm text-neutral-600">Section not found.</p>
            </>
          ) : (
            <SectionStudentsView
              section={activeSection}
              search={search}
              setSearch={setSearch}
              sortRollAsc={sortRollAsc}
              setSortRollAsc={setSortRollAsc}
              backTo="/teacher/sections"
              onViewStudent={(studentId) =>
                navigate(`/teacher/sections/${sectionId}/students/${studentId}`)
              }
            />
          )
        ) : (
          <>
            <ViewPageHeading
              label="VIEW"
              title="Sections Management"
              backTo="/teacher/dashboard"
            />
            <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />
            <SectionsListView
              sections={sections}
              loading={loading}
              error={error}
              onViewStudents={(id) => {
                toast.success(FACULTY_MSG.sections.loaded)
                navigate(`/teacher/sections/${id}/students`)
              }}
            />
          </>
        )}
      </main>
    </>
  )
}
