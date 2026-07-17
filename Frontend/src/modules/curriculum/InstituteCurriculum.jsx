import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import BackButton from '../../components/BackButton.jsx'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'
import { useNotify } from '../../components/notifications.jsx'
import { curriculumGradeFilenameHint } from '../../components/GlendaleWorkflowCallout.jsx'
import { authClient } from '../../lib/auth-client.js'
import { uploadsPathToApiUrl } from '../../lib/fileUrls.js'
import { resolvePdfUrl } from '../../lib/pdfCacheStatus.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import {
  mapCurriculumGuideList,
  mapCurriculumGuideToDashboard,
  normalizeCurriculumList,
  normalizeCurriculumItem,
} from './curriculumGuideMapping.js'

export {
  mapCurriculumGuideList,
  mapCurriculumGuideToDashboard,
  normalizeCurriculumList,
  normalizeCurriculumItem,
} from './curriculumGuideMapping.js'

export const CURRICULUM_STORAGE_KEY = 'lenlearn.curriculums'

const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

/** Grades 7–8 use the junior-high catalog (9 subjects; no Journalism or Research). */
const JUNIOR_HIGH_GRADES = new Set(['Grade 7', 'Grade 8'])
/** Grades 9–10 use the full senior-high catalog (all 11 subjects). */
const SENIOR_HIGH_GRADES = new Set(['Grade 9', 'Grade 10'])
const JUNIOR_HIGH_EXCLUDED_SUBJECT_NAMES = new Set(['journalism', 'research'])

function normalizeSubjectKey(name) {
  return String(name || '').trim().toLowerCase()
}

function subjectGradeLabel(subject) {
  return String(subject?.grade ?? subject?.grade_level ?? '').trim()
}

function subjectOptionValue(subject) {
  const name = String(subject?.subjectName ?? subject?.subject_name ?? '').trim()
  if (name) return name
  return String(subject?.subjectCode ?? subject?.subject_code ?? '').trim()
}

function subjectOptionLabel(subject) {
  return subjectOptionValue(subject)
}

/** Unique institute subjects (deduped by name) for curriculum dropdowns. */
function uniqueSubjectOptions(subjects) {
  const list = Array.isArray(subjects) ? subjects : []
  const byName = new Map()
  for (const s of list) {
    const value = subjectOptionValue(s)
    if (!value) continue
    const key = normalizeSubjectKey(value)
    if (!byName.has(key)) {
      byName.set(key, { value, label: subjectOptionLabel(s) })
    }
  }
  return [...byName.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Subjects for curriculum by grade band:
 * - Grade 7–8: 9 subjects (excludes Journalism and Research)
 * - Grade 9–10: all 11 subjects from the Subjects module catalog
 */
function subjectsForGrade(subjects, grade) {
  const catalog = uniqueSubjectOptions(subjects)
  if (!grade) return catalog

  if (JUNIOR_HIGH_GRADES.has(grade)) {
    return catalog.filter((s) => !JUNIOR_HIGH_EXCLUDED_SUBJECT_NAMES.has(normalizeSubjectKey(s.value)))
  }

  if (SENIOR_HIGH_GRADES.has(grade)) {
    return catalog
  }

  return catalog.filter((s) =>
    (Array.isArray(subjects) ? subjects : []).some(
      (row) => subjectGradeLabel(row) === grade && normalizeSubjectKey(subjectOptionValue(row)) === normalizeSubjectKey(s.value),
    ),
  )
}

function curriculumCardTitle(item) {
  const fn = String(item?.fileName ?? '').trim()
  if (fn) return fn
  return String(item?.subject ?? '').trim() || 'Curriculum guide'
}

function nowDateStamp() {
  return new Date().toISOString().slice(0, 10)
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

async function resolveCurriculumPostgresId(item) {
  const rawId = String(item?.id ?? '').trim()
  if (rawId) return rawId
  return null
}

function curriculumFilePreviewSrc(item) {
  const inline = String(item?.fileDataUrl ?? '').trim()
  if (inline.startsWith('data:') || inline.startsWith('blob:')) {
    return inline
  }
  if (inline.startsWith('http://') || inline.startsWith('https://')) {
    return inline
  }
  const path = String(item?.fileUrl ?? item?.file_data_url ?? inline ?? '').trim()
  if (path) return uploadsPathToApiUrl(path)
  return ''
}

function curriculumFilePathForFetch(item) {
  const path = String(item?.fileUrl ?? item?.file_data_url ?? '').trim()
  if (path) return path
  const inline = String(item?.fileDataUrl ?? '').trim()
  if (inline && !inline.startsWith('data:') && !inline.startsWith('blob:') && !inline.startsWith('http')) {
    return inline
  }
  return ''
}

/** Load authenticated PDFs via fetch+blob so iframe never renders raw JSON error bodies. */
function CurriculumPdfEmbed({ item, title, className = '', frameClassName = 'h-full w-full', emptyClassName = '' }) {
  const [viewerSrc, setViewerSrc] = useState('')
  const [loadError, setLoadError] = useState('')
  const [loading, setLoading] = useState(true)
  const objectUrlRef = useRef('')

  useEffect(() => {
    let cancelled = false

    async function loadPdf() {
      setLoading(true)
      setLoadError('')
      setViewerSrc('')

      const direct = curriculumFilePreviewSrc(item)
      if (!direct) {
        setLoadError('No file preview available.')
        setLoading(false)
        return
      }

      if (direct.startsWith('data:') || direct.startsWith('blob:')) {
        setViewerSrc(direct)
        setLoading(false)
        return
      }

      const fetchUrl = resolvePdfUrl(curriculumFilePathForFetch(item)) || direct

      try {
        const res = await fetch(fetchUrl, { credentials: 'include' })
        const contentType = String(res.headers.get('content-type') || '').toLowerCase()
        if (!res.ok || contentType.includes('application/json')) {
          let message = 'File not found or unavailable. Re-upload the PDF from Curriculum → Edit.'
          if (contentType.includes('json')) {
            try {
              const payload = await res.json()
              if (payload?.message && !String(payload.message).includes('{')) {
                message = String(payload.message)
              }
            } catch {
              /* ignore */
            }
          }
          throw new Error(message)
        }
        const blob = await res.blob()
        if (cancelled) return
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = ''
        }
        const objectUrl = URL.createObjectURL(blob)
        objectUrlRef.current = objectUrl
        setViewerSrc(objectUrl)
      } catch (err) {
        if (!cancelled) {
          setLoadError(err?.message || 'Could not load PDF preview.')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadPdf()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = ''
      }
    }
  }, [item?.id, item?.fileUrl, item?.fileDataUrl, item?.file_data_url])

  const shellClass = className || 'flex h-44 w-full items-center justify-center rounded-lg border bg-neutral-50 p-4 text-center text-sm text-neutral-600'

  if (loading) {
    return <div className={shellClass}>Loading preview…</div>
  }
  if (loadError) {
    return <div className={`${shellClass} ${emptyClassName}`.trim()}>{loadError}</div>
  }
  if (!viewerSrc) {
    return <div className={shellClass}>No file preview available.</div>
  }

  return (
    <iframe
      title={title || 'Curriculum PDF'}
      src={`${viewerSrc}#toolbar=0&navpanes=0`}
      className={`rounded-lg border border-neutral-200 bg-white ${frameClassName}`.trim()}
    />
  )
}

const InstituteCurriculum = forwardRef(function InstituteCurriculum(
  { curriculums, setCurriculums, subjects = [], persistenceMode, setActiveNav, onCurriculumRefresh },
  ref,
) {
  const toast = useNotify()
  const { data: session } = authClient.useSession()
  const sessionUser = session?.user
  const [curriculumPage, setCurriculumPage] = useState('manage')
  const [formError, setFormError] = useState('')
  const [isUploading, setIsUploading] = useState(false)
  const [uploadForm, setUploadForm] = useState({
    grade: '',
    subject: '',
    description: '',
    file: null,
  })
  const [editId, setEditId] = useState('')
  const [editForm, setEditForm] = useState({
    grade: '',
    subject: '',
    description: '',
    file: null,
  })
  const [editingError, setEditingError] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSubject, setFilterSubject] = useState('')
  const [appliedGrade, setAppliedGrade] = useState('')
  const [appliedSubject, setAppliedSubject] = useState('')
  const [viewingItem, setViewingItem] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  useImperativeHandle(ref, () => ({
    openManagePage() {
      setCurriculumPage('manage')
      setEditId('')
      setEditingError('')
      setFormError('')
      setViewingItem(null)
      setDeleteTarget(null)
    },
    openUploadPage() {
      setCurriculumPage('upload')
      setEditId('')
      setFormError('')
      setViewingItem(null)
      setDeleteTarget(null)
    },
  }))

  useEffect(() => {
    if (persistenceMode !== 'local') return
    try {
      localStorage.setItem(CURRICULUM_STORAGE_KEY, JSON.stringify(curriculums))
    } catch {}
  }, [curriculums, persistenceMode])

  const uploadSubjects = useMemo(() => subjectsForGrade(subjects, uploadForm.grade), [subjects, uploadForm.grade])
  const uploadFilenameHint = useMemo(
    () => curriculumGradeFilenameHint(uploadForm.file?.name, uploadForm.grade),
    [uploadForm.file, uploadForm.grade],
  )
  const editSubjects = useMemo(() => subjectsForGrade(subjects, editForm.grade), [subjects, editForm.grade])
  const filterSubjects = useMemo(() => subjectsForGrade(subjects, filterGrade), [subjects, filterGrade])

  const filteredCurriculums = useMemo(() => {
    return curriculums.filter((item) => {
      if (appliedGrade && item.grade !== appliedGrade) return false
      if (appliedSubject && item.subject !== appliedSubject) return false
      return true
    })
  }, [curriculums, appliedGrade, appliedSubject])

  const editingItem = useMemo(
    () => curriculums.find((item) => item.id === editId) || null,
    [curriculums, editId],
  )

  function onUploadGradeChange(value) {
    setUploadForm((prev) => ({ ...prev, grade: value, subject: '' }))
  }

  function onEditGradeChange(value) {
    setEditForm((prev) => ({ ...prev, grade: value, subject: '' }))
  }

  function isAllowedCurriculumGuideFile(file) {
    if (!file) return false
    const name = String(file.name || '').toLowerCase()
    const ext = name.includes('.') ? name.split('.').pop() : ''
    if (ext !== 'pdf') return false
    if (!file.type) return true
    return String(file.type).toLowerCase() === 'application/pdf'
  }

  async function submitUpload(e) {
    e.preventDefault()
    setFormError('')
    if (!uploadForm.grade || !uploadForm.subject || !uploadForm.description.trim()) {
      setFormError('Please complete Grade Level, Subject, and Description.')
      return
    }
    if (!uploadForm.file) {
      setFormError('Please choose a curriculum PDF file.')
      return
    }
    if (!isAllowedCurriculumGuideFile(uploadForm.file)) {
      setFormError('File must be PDF.')
      return
    }
    setIsUploading(true)
    try {
      if (persistenceMode === 'server') {
        const body = new FormData()
        body.append('file', uploadForm.file)
        body.append('title', uploadForm.subject)
        body.append('subject', uploadForm.subject)
        body.append('grade_level', uploadForm.grade)
        body.append('description', uploadForm.description.trim())
        body.append('is_published', 'true')
        const res = await fetch(apiUrl('/api/admin/curriculum-guides'), {
          method: 'POST',
          credentials: 'include',
          body,
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(data?.message || data?.error || `Create failed (${res.status}).`))
        }
        if (typeof onCurriculumRefresh === 'function') {
          await onCurriculumRefresh()
        } else if (data?.id) {
          const mapped = mapCurriculumGuideToDashboard(data, (p) => apiUrl(p))
          if (mapped) setCurriculums((prev) => [mapped, ...prev.filter((x) => x.id !== mapped.id)])
        }
      } else {
        const dataUrl = await readFileAsDataUrl(uploadForm.file)
        const newItem = {
          id: crypto.randomUUID(),
          grade: uploadForm.grade,
          subject: uploadForm.subject,
          description: uploadForm.description.trim(),
          fileName: uploadForm.file.name,
          fileType: uploadForm.file.type,
          fileDataUrl: dataUrl,
          uploadedAt: nowDateStamp(),
          uploadedBy:
            String(sessionUser?.name || sessionUser?.email || sessionUser?.id || '').trim() || 'Administrator',
        }
        setCurriculums((prev) => [newItem, ...prev])
      }
      setUploadForm({ grade: '', subject: '', description: '', file: null })
      setCurriculumPage('manage')
      toast.created('Curriculum guide saved and published for faculty.')
    } catch (err) {
      setFormError(err?.message || 'Could not upload curriculum file.')
      toast.error('Could not create Curriculum Guide.')
    } finally {
      setIsUploading(false)
    }
  }

  function startEdit(item) {
    setEditId(item.id)
    setCurriculumPage('edit')
    setEditingError('')
    setEditForm({
      grade: item.grade,
      subject: item.subject,
      description: item.description,
      file: null,
    })
  }

  async function saveEdit(e) {
    e.preventDefault()
    setEditingError('')
    const target = curriculums.find((x) => x.id === editId)
    if (!target) {
      setEditingError('Curriculum not found.')
      return
    }
    if (!editForm.grade || !editForm.subject || !editForm.description.trim()) {
      setEditingError('Please complete Grade Level, Subject, and Description.')
      return
    }
    if (editForm.file && !isAllowedCurriculumGuideFile(editForm.file)) {
      setEditingError('File must be PDF.')
      return
    }
    let resolvedGuideId = String(target?.id ?? '').trim()
    if (persistenceMode === 'server') {
      resolvedGuideId = String(await resolveCurriculumPostgresId(target) || target?.id || '').trim()
      if (!resolvedGuideId) {
        setEditingError('Could not resolve curriculum record on the server.')
        return
      }
      try {
        let res
        if (editForm.file) {
          const body = new FormData()
          body.append('title', editForm.subject)
          body.append('subject', editForm.subject)
          body.append('grade_level', editForm.grade)
          body.append('description', editForm.description.trim())
          body.append('file', editForm.file)
          res = await fetch(apiUrl(`/api/admin/curriculum-guides/${encodeURIComponent(resolvedGuideId)}`), {
            method: 'PUT',
            credentials: 'include',
            body,
          })
        } else {
          res = await fetch(apiUrl(`/api/admin/curriculum-guides/${encodeURIComponent(resolvedGuideId)}`), {
            method: 'PUT',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: editForm.subject,
              subject: editForm.subject,
              grade_level: editForm.grade,
              description: editForm.description.trim(),
            }),
          })
        }
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setEditingError(String(data?.message || data?.error || `Update failed (${res.status}).`))
          return
        }
        if (typeof onCurriculumRefresh === 'function') {
          await onCurriculumRefresh()
        } else {
          const mapped = mapCurriculumGuideToDashboard(data, (p) => apiUrl(p))
          if (mapped) {
            setCurriculums((prev) => prev.map((item) => (item.id === editId ? mapped : item)))
          }
        }
      } catch (e) {
        setEditingError(String(e?.message || e || 'Network error updating curriculum.'))
        return
      }
    } else {
      let nextFileDataUrl = target.fileDataUrl
      let nextFileName = target.fileName
      let nextFileType = target.fileType
      if (editForm.file) {
        nextFileDataUrl = await readFileAsDataUrl(editForm.file)
        nextFileName = editForm.file.name
        nextFileType = editForm.file.type
      }
      setCurriculums((prev) =>
        prev.map((item) =>
          item.id === editId
            ? {
                ...item,
                grade: editForm.grade,
                subject: editForm.subject,
                description: editForm.description.trim(),
                fileDataUrl: nextFileDataUrl,
                fileName: nextFileName,
                fileType: nextFileType,
              }
            : item,
        ),
      )
    }

    setEditId('')
    setCurriculumPage('manage')
    setEditForm({ grade: '', subject: '', description: '', file: null })
    toast.updated('You have updated Curriculum Guide.')
  }

  function confirmDelete(item) {
    setDeleteTarget(item)
  }

  async function deleteCurriculum() {
    if (!deleteTarget) return
    const target = deleteTarget

    if (persistenceMode === 'server') {
      const guideId = String(target?.id || '').trim()
      if (guideId) {
        try {
          const res = await fetch(apiUrl(`/api/admin/curriculum-guides/${encodeURIComponent(guideId)}`), {
            method: 'DELETE',
            credentials: 'include',
          })
          const data = await res.json().catch(() => ({}))
          if (!res.ok && res.status !== 404) {
            toast.error(String(data?.message || data?.error || `Delete failed (${res.status}).`), {
              title: 'Could not delete curriculum',
              durationMs: 10000,
            })
            return
          }
          if (typeof onCurriculumRefresh === 'function') {
            await onCurriculumRefresh()
          } else {
            setCurriculums((prev) => prev.filter((item) => item.id !== target.id))
          }
        } catch (e) {
          toast.error(String(e?.message || e || 'Network error deleting curriculum.'), {
            title: 'Could not delete curriculum',
            durationMs: 10000,
          })
          return
        }
      }
    } else {
      setCurriculums((prev) => prev.filter((item) => item.id !== target.id))
    }
    setDeleteTarget(null)
    toast.deleted('You have deleted Curriculum Guide.')
  }

  function previewCard(item) {
    const src = curriculumFilePreviewSrc(item)
    if (String(item.fileType || '').startsWith('image/')) {
      return (
        <AuthenticatedImage
          src={src}
          alt={curriculumCardTitle(item)}
          className="h-44 w-full rounded-lg border object-cover"
          fallback={
            <div className="flex h-44 w-full items-center justify-center rounded-lg border bg-neutral-50 p-4 text-center text-sm text-neutral-600">
              Image preview unavailable.
            </div>
          }
        />
      )
    }
    if (!src) {
      return (
        <div className="flex h-44 w-full items-center justify-center rounded-lg border bg-neutral-50 p-4 text-center text-sm text-neutral-600">
          No file preview available.
        </div>
      )
    }
    const isPdf =
      String(item.fileType || src).includes('pdf') ||
      String(item.fileName || src).toLowerCase().endsWith('.pdf')
    if (isPdf) {
      return (
        <div className="h-44 w-full overflow-hidden rounded-lg border bg-neutral-100">
          <CurriculumPdfEmbed item={item} title={curriculumCardTitle(item)} className="" frameClassName="h-44 w-full" />
        </div>
      )
    }
    return (
      <div className="flex h-44 w-full flex-col items-center justify-center gap-2 rounded-lg border bg-neutral-50 p-4 text-center text-sm text-neutral-700">
        <p>{curriculumCardTitle(item)}</p>
        <a href={src} target="_blank" rel="noreferrer" className="font-semibold text-blue-700 underline">
          Open file
        </a>
      </div>
    )
  }

  function openCurriculumManagePage() {
    setActiveNav('curriculum')
    setEditId('')
    setCurriculumPage('manage')
  }

  function openCurriculumUploadPage() {
    setActiveNav('curriculum')
    setEditId('')
    setCurriculumPage('upload')
  }

  function curriculumContent() {
    if (curriculumPage === 'upload') {
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold text-neutral-900">Upload Curriculum Guide</h2>
            <BackButton onClick={openCurriculumManagePage} />
          </div>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
            <h3 className="text-lg font-semibold text-neutral-900">Upload New Curriculum</h3>
            <form onSubmit={submitUpload} className="mt-5 grid gap-4">
              <label className="text-sm font-medium text-neutral-700">
                Grade Level
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={uploadForm.grade}
                  onChange={(e) => onUploadGradeChange(e.target.value)}
                >
                  <option value="">Select Grade</option>
                  {GRADE_LEVELS.map((grade) => (
                    <option key={grade} value={grade}>
                      {grade}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Subject
                <select
                  className="mt-1 w-full rounded-lg border px-3 py-2"
                  value={uploadForm.subject}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, subject: e.target.value }))}
                  disabled={!uploadForm.grade}
                >
                  <option value="">Select Subject</option>
                  {uploadSubjects.map((subject) => (
                    <option key={subject.value} value={subject.value}>
                      {subject.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Curriculum Guide File (PDF)
                <div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                  <label
                    htmlFor="upload-curriculum-file"
                    className="cursor-pointer rounded border border-neutral-400 bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
                  >
                    Choose File
                  </label>
                  <span className="text-neutral-600">{uploadForm.file?.name || 'No file chosen'}</span>
                  <input
                    id="upload-curriculum-file"
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={(e) =>
                      setUploadForm((prev) => ({
                        ...prev,
                        file: e.target.files?.[0] || null,
                      }))
                    }
                  />
                </div>
                {uploadFilenameHint ? (
                  <p className="mt-1 text-xs text-amber-700">{uploadFilenameHint}</p>
                ) : null}
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Description
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Optional description for this curriculum guide."
                />
              </label>
              {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
              <button
                type="submit"
                disabled={isUploading}
                className="w-fit rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {isUploading ? 'Uploading...' : 'Upload Curriculum'}
              </button>
            </form>
          </section>
        </div>
      )
    }

    if (curriculumPage === 'edit' && editId) {
      return (
        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
          <h2 className="text-xl font-bold text-neutral-900">Edit details</h2>
          <p className="mt-1 text-sm text-neutral-600">Update the grade, subject, description, or PDF file below.</p>
          <form onSubmit={saveEdit} className="mt-5 grid gap-4">
            <label className="text-sm font-medium text-neutral-700">
              Grade Level
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={editForm.grade}
                onChange={(e) => onEditGradeChange(e.target.value)}
              >
                <option value="">Select Grade</option>
                {GRADE_LEVELS.map((grade) => (
                  <option key={grade} value={grade}>
                    {grade}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Subject
              <select
                className="mt-1 w-full rounded-lg border px-3 py-2"
                value={editForm.subject}
                onChange={(e) => setEditForm((prev) => ({ ...prev, subject: e.target.value }))}
                disabled={!editForm.grade}
              >
                <option value="">Select Subject</option>
                {editSubjects.map((subject) => (
                  <option key={subject.value} value={subject.value}>
                    {subject.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Replace PDF (optional)
              <div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                <label
                  htmlFor="edit-curriculum-file"
                  className="cursor-pointer rounded border border-neutral-400 bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
                >
                  Choose new PDF
                </label>
                <span className="text-neutral-600">{editForm.file?.name || 'No file chosen'}</span>
                <input
                  id="edit-curriculum-file"
                  type="file"
                  accept=".pdf,application/pdf"
                  className="hidden"
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      file: e.target.files?.[0] || null,
                    }))
                  }
                />
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Leave empty to keep current file: {curriculumCardTitle(editingItem || {}) || 'none'}
              </p>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Description
              <textarea
                className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2"
                value={editForm.description}
                onChange={(e) => setEditForm((prev) => ({ ...prev, description: e.target.value }))}
              />
            </label>
            {editingError ? <p className="text-sm text-red-600">{editingError}</p> : null}
            <div className="flex gap-3">
              <button type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">
                Save details
              </button>
              <button
                type="button"
                className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={openCurriculumManagePage}
              >
                Back
              </button>
            </div>
          </form>
        </section>
      )
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <BackButton onClick={() => setActiveNav('dashboard')} />
            <h2 className="text-3xl font-bold text-neutral-900">Manage Curriculum Guides</h2>
          </div>
          <button
            type="button"
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={openCurriculumUploadPage}
          >
            Upload New Curriculum
          </button>
        </div>

        <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
          <h3 className="text-lg font-bold text-neutral-900">All Curriculum Guides</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={filterGrade}
              onChange={(e) => {
                setFilterGrade(e.target.value)
                setFilterSubject('')
              }}
            >
              <option value="">All Grades</option>
              {GRADE_LEVELS.map((grade) => (
                <option key={grade} value={grade}>
                  {grade}
                </option>
              ))}
            </select>
            <select
              className="rounded-lg border px-3 py-2 text-sm"
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
            >
              <option value="">All Subjects</option>
              {filterSubjects.map((subject) => (
                <option key={subject.value} value={subject.value}>
                  {subject.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setAppliedGrade(filterGrade)
                setAppliedSubject(filterSubject)
              }}
            >
              Filter
            </button>
            <button
              type="button"
              className="rounded-lg bg-neutral-600 px-4 py-2 text-sm font-semibold text-white"
              onClick={() => {
                setFilterGrade('')
                setFilterSubject('')
                setAppliedGrade('')
                setAppliedSubject('')
              }}
            >
              Clear Filters
            </button>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredCurriculums.length === 0 ? (
              <div className="rounded-lg border border-dashed p-5 text-sm text-neutral-500">No curriculum guides found.</div>
            ) : (
              filteredCurriculums.map((item) => (
                <article key={item.id} className="rounded-xl border bg-neutral-50 p-3 shadow-sm">
                  {previewCard(item)}
                  <div className="mt-3 text-left">
                    <p className="font-semibold text-neutral-900">{curriculumCardTitle(item)}</p>
                    <p className="mt-1 text-sm text-neutral-600">
                      {item.grade} | {item.subject}
                    </p>
                    {item.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-neutral-700">{item.description}</p>
                    ) : null}
                    <p className="mt-2 text-xs text-neutral-500">
                      Uploaded: {item.uploadedAt} | By: {item.uploadedBy}
                    </p>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      className="rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => setViewingItem(item)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="rounded bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => startEdit(item)}
                    >
                      Edit details
                    </button>
                    <button
                      type="button"
                      className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
                      onClick={() => confirmDelete(item)}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>
      </div>
    )
  }

  return (
    <>
      {curriculumContent()}

      {viewingItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-5xl rounded-xl bg-white p-4 shadow-2xl md:p-5">
            <div className="mb-3 flex items-center justify-between">
              <p className="font-semibold text-neutral-900">{curriculumCardTitle(viewingItem)}</p>
              <button
                type="button"
                className="rounded bg-neutral-200 px-3 py-1 text-sm font-semibold"
                onClick={() => setViewingItem(null)}
              >
                Close
              </button>
            </div>
            {String(viewingItem.fileType || '').startsWith('image/') ? (
              <AuthenticatedImage
                src={curriculumFilePreviewSrc(viewingItem)}
                alt={curriculumCardTitle(viewingItem)}
                className="max-h-[75vh] w-full object-contain"
                fallback={
                  <div className="flex h-[75vh] w-full items-center justify-center rounded border bg-neutral-50 p-6 text-center text-sm text-neutral-600">
                    Image preview unavailable.
                  </div>
                }
              />
            ) : (
              <CurriculumPdfEmbed
                item={viewingItem}
                title={curriculumCardTitle(viewingItem)}
                className="flex h-[75vh] w-full items-center justify-center rounded border bg-neutral-50 p-6 text-center text-sm text-neutral-600"
                frameClassName="h-[75vh] w-full"
              />
            )}
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Confirm Delete</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Are you sure you want to delete <span className="font-semibold">{curriculumCardTitle(deleteTarget)}</span>? This action
              cannot be undone.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setDeleteTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => void deleteCurriculum()}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
})

export default InstituteCurriculum
