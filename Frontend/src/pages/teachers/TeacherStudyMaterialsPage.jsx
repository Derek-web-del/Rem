import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useLocation, useNavigate, useOutletContext } from 'react-router-dom'

import PdfViewerModal from '../../components/PdfViewerModal.jsx'
import { StudyMaterialPdfThumb } from '../../components/StudyMaterialPdfViewer.jsx'

import {

  deleteFacultyStudyMaterial,

  fetchFacultyStudyMaterials,

  formatGradeTag,

  formatMaterialUploadDate,

  formatSubjectTag,

} from '../../lib/facultyStudyMaterials.js'
import { isOnline } from '../../lib/offlineSync.js'
import { useOfflineStatus } from '../../hooks/useOfflineStatus.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import PdfOfflineBadge from '../../components/PdfOfflineBadge.jsx'

import {

  FACULTY_MSG,

  FACULTY_TOAST_ID,

  FACULTY_ANNOUNCEMENT_TOAST_MS,

  useFacultyNotify,

} from '../../lib/facultyNotify.js'

import TeacherBackButton from './TeacherBackButton.jsx'

import TeacherMainHeader from './TeacherMainHeader.jsx'

import { ACTION_BLUE } from './instituteChrome.js'



const cardActionClass =

  'inline-flex items-center gap-1.5 rounded border border-neutral-300 bg-white px-3 py-1.5 text-xs font-semibold text-neutral-700 transition hover:bg-neutral-50'



function PdfBadgeIcon({ className }) {

  return (

    <div className={`flex items-center justify-center rounded-lg bg-sky-100 text-sky-700 ${className}`}>

      <svg className="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>

        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />

        <path d="M14 2v6h6" />

        <path d="M8 13h2M8 17h6M8 9h1" />

      </svg>

    </div>

  )

}



function StudyMaterialCard({ material, onView, onEdit, onDelete, offlineDisabled = false, badgeRefreshKey = 0 }) {

  const [hover, setHover] = useState(false)

  const grade = formatGradeTag(material.grade_level)

  const subject = formatSubjectTag(material.subject)

  const title = material.title || material.file_name || 'Study material'

  const uploaded = formatMaterialUploadDate(material.created_at)

  const by = material.uploaded_by_name || 'Faculty'



  return (

    <article

      className="group relative flex flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm transition hover:shadow-md"

      onMouseEnter={() => setHover(true)}

      onMouseLeave={() => setHover(false)}

    >

      <div className="relative bg-neutral-50 p-3">

        <StudyMaterialPdfThumb fileUrl={material.file_url} title={title} className="h-44" />

        {hover ? (

          <button

            type="button"

            className="absolute inset-0 flex items-center justify-center bg-black/35 transition"

            onClick={() => onView(material)}

          >

            <span className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow">

              <i className="ti ti-eye" aria-hidden="true" />

              View

            </span>

          </button>

        ) : null}

      </div>

      <div className="flex flex-1 flex-col gap-2 p-4 text-left">

        <div className="flex items-start gap-2">

          <PdfBadgeIcon className="h-10 w-10 shrink-0" />

          <p className="min-w-0 flex-1 truncate text-xs font-medium text-neutral-600">{material.file_name || '—'}</p>

        </div>

        <div className="flex flex-wrap gap-2">

          <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-800">

            {grade}

          </span>

          <span className="rounded-full bg-neutral-200 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-700">

            {subject}

          </span>

          <PdfOfflineBadge fileUrl={material.file_url} refreshKey={badgeRefreshKey} />

        </div>

        <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-900">{title}</h3>

        <p className="mt-auto text-xs text-neutral-500">

          Uploaded: {uploaded} · By: {by}

        </p>

      </div>

      <div className="flex flex-wrap gap-2 border-t border-neutral-100 px-4 py-3">

        <button type="button" className={cardActionClass} disabled={offlineDisabled} title={offlineDisabled ? 'Not available offline' : undefined} onClick={() => onEdit(material)}>

          <i className="ti ti-pencil text-sm" aria-hidden="true" />

          Edit

        </button>

        <button type="button" className={cardActionClass} onClick={() => onView(material)}>

          <i className="ti ti-eye text-sm" aria-hidden="true" />

          View

        </button>

        <button type="button" className={cardActionClass} disabled={offlineDisabled} title={offlineDisabled ? 'Not available offline' : undefined} onClick={() => onDelete(material)}>

          <i className="ti ti-trash text-sm" aria-hidden="true" />

          Delete

        </button>

      </div>

    </article>

  )

}



export default function TeacherStudyMaterialsPage() {

  const navigate = useNavigate()

  const location = useLocation()

  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}

  const toast = useFacultyNotify()

  const toastRef = useRef(toast)

  toastRef.current = toast



  const [materials, setMaterials] = useState([])

  const [loading, setLoading] = useState(true)

  const [fromCache, setFromCache] = useState(false)

  const { isOffline } = useOfflineStatus()

  const [query, setQuery] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)

  const [deleting, setDeleting] = useState(false)

  const [viewing, setViewing] = useState(null)
  const [badgeRefreshKey, setBadgeRefreshKey] = useState(0)



  useEffect(() => {

    setSidebarNavLocked?.(false)

  }, [setSidebarNavLocked])



  const loadMaterials = useCallback(async () => {

    setLoading(true)

    try {

      const offline = !isOnline()

      const list = await fetchFacultyStudyMaterials()

      setMaterials(Array.isArray(list) ? list : [])

      setFromCache(offline)

    } catch (e) {

      setMaterials([])

      toastRef.current.error(FACULTY_MSG.studyMaterial.loadFailed, {

        toastId: FACULTY_TOAST_ID.studyMaterialsFetchError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      console.error('[TeacherStudyMaterialsPage]', e)

    } finally {

      setLoading(false)

    }

  }, [])



  useEffect(() => {

    if (location.pathname !== '/teacher/study-materials') return

    void loadMaterials()

  }, [location.pathname, location.key, loadMaterials])



  const filtered = useMemo(() => {

    const q = query.trim().toLowerCase()

    if (!q) return materials

    return materials.filter((m) => {

      return (

        String(m.title || '').toLowerCase().includes(q) ||

        String(m.grade_level || '').toLowerCase().includes(q) ||

        String(m.subject || '').toLowerCase().includes(q) ||

        String(m.file_name || '').toLowerCase().includes(q) ||

        String(m.uploaded_by_name || '').toLowerCase().includes(q)

      )

    })

  }, [materials, query])



  async function confirmDelete() {

    if (!deleteTarget) return

    setDeleting(true)

    try {

      await deleteFacultyStudyMaterial(deleteTarget.id)

      setDeleteTarget(null)

      if (viewing?.id === deleteTarget.id) setViewing(null)

      toastRef.current.success(FACULTY_MSG.studyMaterial.deleted, {

        toastId: 'study-material-delete-success',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      await loadMaterials()

    } catch {

      toastRef.current.error(FACULTY_MSG.studyMaterial.deleteFailed, {

        toastId: 'study-material-delete-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

    } finally {

      setDeleting(false)

    }

  }



  return (

    <>

      <TeacherMainHeader pageTitle="Study Materials" onLogout={logoutToPortal} />

      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">

        <TeacherBackButton to="/teacher/dashboard" />



        <div className="flex flex-wrap items-start justify-between gap-3">

          <div>

            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>

            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Study Materials</h2>

          </div>

          <button

            type="button"

            disabled={isOffline}

            title={isOffline ? 'Not available offline' : undefined}

            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"

            style={{ backgroundColor: ACTION_BLUE }}

            onClick={() => navigate('/teacher/study-materials/new')}

          >

            + Add material

          </button>

        </div>

        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />



        <div className="relative max-w-md">

          <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />

          <input

            type="search"

            placeholder="Search materials..."

            value={query}

            onChange={(e) => setQuery(e.target.value)}

            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

          />

        </div>



        {loading ? (

          <p className="py-12 text-center text-sm text-neutral-500">Loading study materials…</p>

        ) : filtered.length === 0 ? (

          <p className="rounded-xl border border-dashed border-neutral-200 bg-white py-12 text-center text-sm text-neutral-500">

            No study materials found.

          </p>

        ) : (

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">

            {filtered.map((material) => {

              if (!material?.id) return null

              return (

                <StudyMaterialCard

                  key={material.id}

                  material={material}

                  onView={setViewing}

                  onEdit={(m) => navigate(`/teacher/study-materials/${m.id}/edit`)}

                  onDelete={setDeleteTarget}

                  offlineDisabled={isOffline}

                  badgeRefreshKey={badgeRefreshKey}

                />

              )

            })}

          </div>

        )}

      </main>



      {viewing ? (
        <PdfViewerModal
          fileUrl={viewing.file_url}
          fileName={viewing.file_name || viewing.title || 'document.pdf'}
          onClose={() => {
            setViewing(null)
            setBadgeRefreshKey((k) => k + 1)
          }}
          onDownloadUnavailable={(msg) => toast.error(msg)}
        />
      ) : null}



      {deleteTarget ? (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">

          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">

            <h3 className="text-lg font-bold text-neutral-900">Delete material</h3>

            <p className="mt-2 text-sm text-neutral-700">

              Delete <strong>{deleteTarget.title}</strong>? This cannot be undone.

            </p>

            <div className="mt-4 flex justify-end gap-2">

              <button

                type="button"

                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"

                onClick={() => setDeleteTarget(null)}

                disabled={deleting}

              >

                Cancel

              </button>

              <button

                type="button"

                className="rounded-lg bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"

                onClick={() => void confirmDelete()}

                disabled={deleting}

              >

                {deleting ? 'Deleting…' : 'Delete'}

              </button>

            </div>

          </div>

        </div>

      ) : null}

    </>

  )

}

