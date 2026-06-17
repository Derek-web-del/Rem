import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { fetchTeacherSubjects } from '../../lib/teacherPortalOffline.js'
import { isOnline } from '../../lib/offlineSync.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, useFacultyNotify } from '../../lib/facultyNotify.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import SubjectCoverImage from '../../components/SubjectCoverImage.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

function SubjectCard({ subject, onDetails }) {
  const name = String(subject.subject_name || '').trim() || '—'
  const grade = String(subject.grade_level || '').trim() || '—'

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-sky-100 to-blue-200">
        <SubjectCoverImage subject={subject} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-base font-bold text-neutral-900">{name}</p>
        <p className="truncate text-sm text-neutral-600">{grade}</p>
        <button
          type="button"
          onClick={() => onDetails(subject)}
          className="mt-3 w-full rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          style={{ backgroundColor: ACTION_BLUE }}
        >
          Details
        </button>
      </div>
    </article>
  )
}

export default function TeacherSubjectsPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast
  const hasFetched = useRef(false)

  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const loadSubjects = async () => {
      setLoading(true)
      setError(null)
      try {
        const offline = !isOnline()
        const list = await fetchTeacherSubjects()
        setSubjects(list)
        setFromCache(offline)
      } catch (e) {
        const msg = String(e?.message || e)
        console.error('[TeacherSubjectsPage] fetch error:', msg)
        setSubjects([])
        setError(msg)
        toastRef.current.error(FACULTY_MSG.subjects.loadFailed, {
          toastId: FACULTY_TOAST_ID.subjectsFetchError,
        })
      } finally {
        setLoading(false)
      }
    }

    void loadSubjects()
  }, [])

  return (
    <>
      <TeacherMainHeader pageTitle="Subjects" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Subject Management</h2>
          </div>
        </div>
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">Loading subjects…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : subjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-12 text-center text-sm text-neutral-600">
            No subjects assigned to your faculty account yet.
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subjects.map((s) => (
              <SubjectCard
                key={String(s.id)}
                subject={s}
                onDetails={(sub) => navigate(`/teacher/subjects/${encodeURIComponent(String(sub.id))}`)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
