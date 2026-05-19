import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams, useLocation } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, useFacultyNotify } from '../../lib/facultyNotify.js'
import { resolveTeacherFileUrl, detectMaterialKind } from '../../lib/teacherMedia.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const labelStyle = {
  padding: '10px 14px',
  color: 'var(--color-text-secondary, #6b7280)',
  fontSize: '13px',
  borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
  width: '20%',
  whiteSpace: 'nowrap',
}

const valueStyle = {
  padding: '10px 14px',
  color: 'var(--color-text-primary, #111827)',
  fontSize: '13px',
  borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
  width: '30%',
}

const STACKED_BTN = {
  width: '100px',
  border: 'none',
  padding: '6px 0',
  borderRadius: '6px',
  fontSize: '13px',
  cursor: 'pointer',
  fontWeight: 600,
  color: 'white',
  display: 'block',
}

const PAGE_SIZE = 1

function cell(value) {
  const s = value != null ? String(value).trim() : ''
  return s || '—'
}

function isAdminSyllabusMaterial(material) {
  return Boolean(material?.is_admin_syllabus) || String(material?.id || '').startsWith('admin-syllabus-')
}

function SortHeader({ label, active, direction, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-800"
    >
      {label}
      <span className="inline-flex flex-col leading-none text-[9px] text-neutral-400">
        <i className={`ti ti-chevron-up ${active && direction === 'asc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
        <i className={`ti ti-chevron-down -mt-0.5 ${active && direction === 'desc' ? 'text-neutral-800' : ''}`} aria-hidden="true" />
      </span>
    </button>
  )
}

function materialDownloadName(material) {
  return (
    String(material?.title || material?.file_name || material?.material_name || material?.unit_name || 'material.pdf').trim() ||
    'material.pdf'
  )
}

function materialDisplayTitle(material) {
  return (
    String(material?.title || material?.material_name || material?.unit_name || material?.file_name || 'Untitled Material').trim() ||
    'Untitled Material'
  )
}

async function downloadMaterialFile(material) {
  const url = resolveTeacherFileUrl(material?.file_url)
  const name = materialDownloadName(material)
  if (!url) return

  if (url.startsWith('data:')) {
    const a = document.createElement('a')
    a.href = url
    a.download = name
    document.body.appendChild(a)
    a.click()
    a.remove()
    return
  }

  const res = await fetch(url, { credentials: 'include' })
  if (!res.ok) throw new Error('Download failed.')
  const blob = await res.blob()
  const objectUrl = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = objectUrl
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(objectUrl)
}

function MaterialActionButtons({ material, expanded, onView, onEdit, onDelete }) {
  return (
    <div className="relative z-10 flex flex-col gap-2" style={{ pointerEvents: 'auto' }}>
      <button
        type="button"
        style={{ ...STACKED_BTN, position: 'relative', zIndex: 10, background: '#3B82F6' }}
        onClick={() => onView(material)}
      >
        {expanded ? 'Close' : 'View'}
      </button>
      <button
        type="button"
        style={{ ...STACKED_BTN, position: 'relative', zIndex: 10, background: '#F59E0B' }}
        onClick={() => onEdit(material)}
      >
        Edit
      </button>
      <button
        type="button"
        style={{ ...STACKED_BTN, position: 'relative', zIndex: 10, background: '#EF4444' }}
        onClick={() => onDelete(material)}
      >
        Delete
      </button>
    </div>
  )
}

function MaterialPreviewCell({ material, downloading, onDownload }) {
  const url = resolveTeacherFileUrl(material?.file_url)
  const kind = detectMaterialKind(material)
  const title = cell(materialDisplayTitle(material))
  const downloadName = materialDownloadName(material)
  const directDownload = Boolean(url && (url.startsWith('data:') || url.includes('/uploads/')))
  const showPdfViewer =
    kind === 'pdf' ||
    String(material?.file_url || '').includes('/syllabus-file') ||
    /\.pdf($|\?)/i.test(downloadName)

  if (!url) {
    return (
      <div className="flex w-[200px] flex-col items-center">
        <div
          className="flex items-center justify-center rounded border border-neutral-200 bg-neutral-100 text-xs text-neutral-500"
          style={{ width: 200, height: 250 }}
        >
          No preview
        </div>
      </div>
    )
  }

  return (
    <div className="flex w-[200px] max-w-[200px] flex-col items-center gap-2 overflow-hidden">
      {showPdfViewer ? (
        <div
          className="overflow-hidden rounded border border-neutral-200 bg-white shadow-sm"
          style={{ width: 200, height: 250, maxWidth: '100%' }}
        >
          <iframe
            title={title}
            src={url}
            width={200}
            height={250}
            className="block border-0 bg-white"
            style={{ width: 200, height: 250, maxWidth: '100%', pointerEvents: 'auto' }}
          />
        </div>
      ) : kind === 'image' ? (
        <div className="overflow-auto rounded border border-neutral-200 bg-white shadow-sm" style={{ width: 200, height: 250 }}>
          <img src={url} alt={title} className="h-full w-full object-contain" />
        </div>
      ) : (
        <div
          className="flex flex-col items-center justify-center rounded border border-neutral-200 bg-neutral-50 px-2 text-center text-[11px] font-medium text-neutral-600"
          style={{ width: 200, height: 250 }}
        >
          {title}
        </div>
      )}
      {directDownload ? (
        <a
          href={url}
          download={downloadName}
          className="inline-flex w-[100px] items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold text-white hover:brightness-110"
          style={{ backgroundColor: '#22C55E' }}
        >
          <i className="ti ti-download text-sm" aria-hidden="true" />
          Download
        </a>
      ) : (
        <button
          type="button"
          disabled={downloading}
          onClick={() => onDownload(material)}
          className="inline-flex w-[100px] items-center justify-center gap-1.5 rounded-md py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
          style={{ backgroundColor: '#22C55E' }}
        >
          <i className="ti ti-download text-sm" aria-hidden="true" />
          {downloading ? '…' : 'Download'}
        </button>
      )}
    </div>
  )
}

export default function TeacherSubjectProfile() {
  const navigate = useNavigate()
  const location = useLocation()
  const { subjectId } = useParams()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [subject, setSubject] = useState(null)
  const [materials, setMaterials] = useState([])
  const [loadingSubject, setLoadingSubject] = useState(true)
  const [loadingMaterials, setLoadingMaterials] = useState(true)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [sortKey, setSortKey] = useState('unit_no')
  const [sortDir, setSortDir] = useState('asc')
  const [expandedMaterialId, setExpandedMaterialId] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [downloadingId, setDownloadingId] = useState(null)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadSubject = useCallback(async () => {
    if (!subjectId) return
    setLoadingSubject(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}`), {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to load subject.')
      setSubject(data)
    } catch (e) {
      setSubject(null)
      setError(String(e?.message || e))
      toastRef.current.error(FACULTY_MSG.subjects.loadFailed, { toastId: FACULTY_TOAST_ID.subjectsFetchError })
    } finally {
      setLoadingSubject(false)
    }
  }, [subjectId])

  const loadMaterials = useCallback(async () => {
    if (!subjectId) return
    setLoadingMaterials(true)
    try {
      const res = await fetch(
        apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}/materials`),
        { credentials: 'include' },
      )
      const text = await res.text()
      let data = []
      if (text) {
        try {
          data = JSON.parse(text)
        } catch {
          throw new Error('Materials response was not valid JSON.')
        }
      }
      if (!res.ok) {
        const msg =
          (data && typeof data === 'object' && (data.message || data.error)) || 'Failed to load materials.'
        throw new Error(String(msg))
      }
      setMaterials(Array.isArray(data) ? data : Array.isArray(data?.materials) ? data.materials : [])
    } catch (e) {
      setMaterials([])
      setError(String(e?.message || e))
      toastRef.current.error(FACULTY_MSG.subjects.loadFailed, { toastId: FACULTY_TOAST_ID.subjectsFetchError })
    } finally {
      setLoadingMaterials(false)
    }
  }, [subjectId])

  useEffect(() => {
    void loadSubject()
    void loadMaterials()
  }, [loadSubject, loadMaterials, location.key])

  useEffect(() => {
    setPage(1)
    setExpandedMaterialId(null)
  }, [query, sortKey, sortDir])

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  const filteredMaterials = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = materials
    if (q) {
      list = materials.filter((m) => {
        return (
          String(m.unit_no || '').toLowerCase().includes(q) ||
          String(m.unit_name || '').toLowerCase().includes(q) ||
          String(m.material_name || '').toLowerCase().includes(q) ||
          String(m.title || '').toLowerCase().includes(q) ||
          String(m.file_name || '').toLowerCase().includes(q)
        )
      })
    }
    const sorted = [...list].sort((a, b) => {
      const av = sortKey === 'unit_no' ? Number(a.unit_no) || 0 : materialDisplayTitle(a).toLowerCase()
      const bv = sortKey === 'unit_no' ? Number(b.unit_no) || 0 : materialDisplayTitle(b).toLowerCase()
      if (typeof av === 'number' && typeof bv === 'number') {
        return sortDir === 'asc' ? av - bv : bv - av
      }
      const cmp = String(av).localeCompare(String(bv))
      return sortDir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [materials, query, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredMaterials.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pageMaterials = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE
    return filteredMaterials.slice(start, start + PAGE_SIZE)
  }, [filteredMaterials, safePage])

  const handleView = (material) => {
    const id = String(material?.id ?? '')
    setExpandedMaterialId((prev) => (prev === id ? null : id))
  }

  const handleEdit = (material) => {
    if (!subjectId || material?.id == null || material.id === '') return
    navigate(
      `/teacher/subjects/${encodeURIComponent(subjectId)}/materials/${encodeURIComponent(material.id)}/edit`,
      isAdminSyllabusMaterial(material) ? { state: { adminMaterial: material } } : undefined,
    )
  }

  const handleDeletePrompt = (material) => {
    setDeleteTarget(material)
  }

  const handleDownload = async (material) => {
    const id = String(material?.id ?? '')
    setDownloadingId(id)
    setError(null)
    try {
      await downloadMaterialFile(material)
    } catch (e) {
      setError(String(e?.message || e))
    } finally {
      setDownloadingId(null)
    }
  }

  const confirmDeleteMaterial = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      const adminSyllabus = isAdminSyllabusMaterial(deleteTarget)
      const res = adminSyllabus
        ? await fetch(apiUrl(`/api/teacher/subjects/${encodeURIComponent(subjectId)}/syllabus`), {
            method: 'DELETE',
            credentials: 'include',
          })
        : await fetch(apiUrl(`/api/teacher/materials/${encodeURIComponent(deleteTarget.id)}`), {
            method: 'DELETE',
            credentials: 'include',
          })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Delete failed.')
      setDeleteTarget(null)
      setExpandedMaterialId(null)
      await loadMaterials()
      if (adminSyllabus) await loadSubject()
      toast.success(FACULTY_MSG.studyMaterial.deleted)
    } catch (e) {
      setError(String(e?.message || e))
      toast.error(FACULTY_MSG.studyMaterial.deleteFailed)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Subjects" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <TeacherBackButton to="/teacher/subjects" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Subject Profile</h2>
          </div>
          {subjectId ? (
            <Link
              to={`/teacher/subjects/${encodeURIComponent(subjectId)}/materials/add`}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
              style={{ backgroundColor: ACTION_BLUE }}
            >
              Add Material
            </Link>
          ) : null}
        </div>

        {loadingSubject ? (
          <div className="py-12 text-center text-sm text-neutral-500">Loading subject…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : !subject ? (
          <p className="text-sm text-neutral-600">Subject not found.</p>
        ) : (
          <>
            <div
              style={{
                background: 'var(--color-background-primary, #ffffff)',
                border: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                borderRadius: 'var(--border-radius-lg, 12px)',
                padding: '1.5rem',
              }}
            >
              <h3 style={{ fontWeight: 600, marginBottom: '1rem', fontSize: '16px', color: 'var(--color-text-primary, #111827)' }}>
                Subject Info:
              </h3>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <tbody>
                  <tr>
                    <td style={labelStyle}>Subject name</td>
                    <td style={valueStyle} colSpan={3}>
                      {cell(subject.subject_name)}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Subject Quarter</td>
                    <td style={valueStyle}>{cell(subject.quarter)}</td>
                    <td style={labelStyle}>Subject Grade Level</td>
                    <td style={valueStyle}>{cell(subject.grade_level)}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Subject Faculty</td>
                    <td style={valueStyle}>{cell(subject.faculty_name || subject.assignedFacultyName)}</td>
                    <td style={labelStyle}>Subject Code</td>
                    <td style={valueStyle}>{cell(subject.subject_code)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
              <div className="border-b-2 pb-2" style={{ borderColor: ACTION_BLUE }}>
                <div className="inline-flex items-center gap-2">
                  <h3 className="text-base font-bold text-neutral-800">Subject Materials</h3>
                  <span className="rounded-full bg-neutral-200 px-2 py-0.5 text-xs font-bold text-neutral-600 tabular-nums">
                    {loadingMaterials ? '…' : materials.length}
                  </span>
                </div>
              </div>

              <div className="relative mt-4 max-w-xs">
                <i className="ti ti-search pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" aria-hidden="true" />
                <input
                  type="search"
                  placeholder="Search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-neutral-200 bg-white py-2 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {loadingMaterials ? (
                <div className="py-12 text-center text-sm text-neutral-500">Loading materials…</div>
              ) : (
                <>
                  <div className="mt-4 overflow-x-auto rounded-lg border border-neutral-200">
                    <table className="min-w-full border-collapse text-sm">
                      <thead className="border-b border-neutral-200 bg-white">
                        <tr>
                          <th className="px-4 py-3 text-left">
                            <SortHeader
                              label="Unit No"
                              active={sortKey === 'unit_no'}
                              direction={sortDir}
                              onClick={() => toggleSort('unit_no')}
                            />
                          </th>
                          <th className="px-4 py-3 text-left">
                            <SortHeader
                              label="Unit Name"
                              active={sortKey === 'unit_name'}
                              direction={sortDir}
                              onClick={() => toggleSort('unit_name')}
                            />
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Actions
                          </th>
                          <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-500">
                            Preview
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-100">
                        {pageMaterials.length === 0 ? (
                          <tr>
                            <td colSpan={4} className="px-4 py-10 text-center text-sm text-neutral-500">
                              No materials found.
                            </td>
                          </tr>
                        ) : (
                          pageMaterials.map((m) => {
                            const rowId = String(m.id)
                            const isExpanded = expandedMaterialId === rowId
                            const fileUrl = resolveTeacherFileUrl(m?.file_url)
                            const downloadName = materialDownloadName(m)
                            return (
                              <Fragment key={rowId}>
                                <tr className="align-top text-neutral-800">
                                  <td className="px-4 py-4 font-medium tabular-nums">{cell(m.unit_no)}</td>
                                  <td className="px-4 py-4 font-medium uppercase tracking-wide text-neutral-800">
                                    {cell(materialDisplayTitle(m))}
                                  </td>
                                  <td className="relative z-10 px-4 py-4 align-top" style={{ pointerEvents: 'auto' }}>
                                    <MaterialActionButtons
                                      material={m}
                                      expanded={isExpanded}
                                      onView={handleView}
                                      onEdit={handleEdit}
                                      onDelete={handleDeletePrompt}
                                    />
                                  </td>
                                  <td className="relative overflow-hidden px-4 py-4 align-top" style={{ maxWidth: 220 }}>
                                    <MaterialPreviewCell
                                      material={m}
                                      downloading={downloadingId === rowId}
                                      onDownload={handleDownload}
                                    />
                                  </td>
                                </tr>
                                {isExpanded && fileUrl ? (
                                  <tr>
                                    <td colSpan={4} className="border-t border-neutral-200 bg-neutral-50 p-0">
                                      <div className="w-full px-4 py-4">
                                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                                          <p className="text-sm font-semibold text-neutral-800">{downloadName}</p>
                                          <button
                                            type="button"
                                            className="inline-flex items-center gap-1.5 rounded-md px-4 py-2 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-60"
                                            style={{ backgroundColor: '#22C55E' }}
                                            disabled={downloadingId === rowId}
                                            onClick={() => void handleDownload(m)}
                                          >
                                            <i className="ti ti-download text-sm" aria-hidden="true" />
                                            {downloadingId === rowId ? 'Downloading…' : 'Download'}
                                          </button>
                                        </div>
                                        <div className="w-full overflow-hidden rounded-lg border border-neutral-200 bg-white">
                                          <iframe
                                            title={downloadName}
                                            src={fileUrl}
                                            className="block h-[min(70vh,560px)] w-full border-0"
                                          />
                                        </div>
                                      </div>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            )
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 flex items-center justify-between border-t border-neutral-100 pt-3 text-sm font-medium text-neutral-600">
                    <button
                      type="button"
                      disabled={safePage <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="disabled:opacity-40 hover:text-neutral-900"
                    >
                      ← Prev
                    </button>
                    <span className="underline tabular-nums text-neutral-800">{safePage}</span>
                    <button
                      type="button"
                      disabled={safePage >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="disabled:opacity-40 hover:text-neutral-900"
                    >
                      Next →
                    </button>
                  </div>
                </>
              )}
            </section>
          </>
        )}
      </main>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete material</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Are you sure you want to delete this material? This cannot be undone.
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
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white"
                style={{ background: '#EF4444' }}
                onClick={() => void confirmDeleteMaterial()}
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
