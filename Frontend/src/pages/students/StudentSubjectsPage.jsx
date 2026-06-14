import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { fetchStudentSubjects } from '../../lib/studentPortal.js'
import { isOnline } from '../../lib/offlineSync.js'
import { subjectImageDisplaySrc } from '../../lib/subjectImages.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import { ACTION_BLUE } from '../teachers/instituteChrome.js'

function SubjectCard({ subject, onDetails }) {
  const cover = subjectImageDisplaySrc(subject, { apiUrlFn: apiUrl })
  const name = String(subject.subject_name || '').trim() || '—'
  const grade = String(subject.grade_level || '').trim() || '—'

  return (
    <article className="flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md">
      <div className="relative aspect-[4/3] w-full bg-gradient-to-br from-sky-100 to-blue-200">
        <img src={cover} alt={name} className="h-full w-full object-cover" />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <p className="truncate text-base font-bold text-neutral-900">{name}</p>
        <p className="truncate text-sm text-neutral-600">{grade}</p>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => onDetails(subject)}
            className="w-full rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
          >
            Details
          </button>
        </div>
      </div>
    </article>
  )
}

export default function StudentSubjectsPage() {
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const hasFetched = useRef(false)

  const [subjects, setSubjects] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    if (hasFetched.current) return
    hasFetched.current = true

    const loadSubjects = async () => {
      setLoading(true)
      setError(null)
      try {
        const offline = !isOnline()
        const list = await fetchStudentSubjects()
        setSubjects(list)
        setFromCache(offline)
      } catch (e) {
        const msg = String(e?.message || e)
        console.error('[StudentSubjectsPage]', msg)
        setSubjects([])
        setError(msg)
      } finally {
        setLoading(false)
      }
    }

    void loadSubjects()
  }, [])

  return (
    <>
      <StudentMainHeader pageTitle="Subjects" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <StudentViewHeader title="Subject Management" backTo="/student/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">Loading subjects…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : subjects.length === 0 ? (
          <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-12 text-center text-sm text-neutral-600">
            {!isOnline()
              ? 'No offline subjects yet. Connect to the internet and open the dashboard once to sync.'
              : 'No subjects assigned for your grade level yet.'}
          </div>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {subjects.map((s) => (
              <SubjectCard
                key={String(s.id)}
                subject={s}
                onDetails={(sub) => navigate(`/student/subjects/${encodeURIComponent(String(sub.id))}`)}
              />
            ))}
          </div>
        )}
      </main>
    </>
  )
}
