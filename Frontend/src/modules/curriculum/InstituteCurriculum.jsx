import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import BackButton from '../../components/BackButton.jsx'
import { useNotify } from '../../components/notifications.jsx'
import { authClient } from '../../lib/auth-client.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'

export const CURRICULUM_STORAGE_KEY = 'lenlearn.curriculums'

const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']
const SUBJECTS_BY_GRADE = {
  'Grade 7': ['ENGLISH_7', 'MATH_7', 'SCIENCE_7', 'FILIPINO_7'],
  'Grade 8': ['ENGLISH_8', 'MATH_8', 'SCIENCE_8', 'FILIPINO_8'],
  'Grade 9': ['ENGLISH_9', 'MATH_9', 'SCIENCE_9', 'FILIPINO_9'],
  'Grade 10': ['ENGLISH_10', 'MATH_10', 'SCIENCE_10', 'FILIPINO_10'],
}

/** Repair curriculum rows from server JSON or localStorage (snake_case, missing fields, literal "null"). */
export function normalizeCurriculumList(list) {
  if (!Array.isArray(list)) return []
  return list.map((raw, index) => normalizeCurriculumItem(raw, index)).filter(Boolean)
}

export function normalizeCurriculumItem(raw, index) {
  if (!raw || typeof raw !== 'object') return null
  const nz = (v) => {
    if (v == null) return ''
    const s = String(v).trim()
    if (!s || s === 'null' || s === 'undefined') return ''
    return s
  }
  const id = nz(raw.id) || nz(raw.source_id) || `legacy-${index}`
  const grade = nz(raw.grade) || nz(raw.grade_level)
  const subject = nz(raw.subject) || nz(raw.title)
  const fileName = nz(raw.fileName) || nz(raw.file_name)
  return {
    ...raw,
    id,
    grade: grade || '',
    subject: subject || '(no subject)',
    description: nz(raw.description),
    fileName,
  }
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
  const pg = Number(item?.postgresCurriculumId)
  if (Number.isFinite(pg) && pg > 0) return pg
  const rawId = String(item?.id ?? '').trim()
  if (/^\d+$/.test(rawId)) return Number(rawId)
  if (!rawId) return null
  const res = await fetch(apiUrl('/api/v1/curriculum'), { credentials: 'include' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) return null
  const list = Array.isArray(data?.curriculum) ? data.curriculum : []
  const match = list.find((row) => String(row?.source_id ?? '') === rawId)
  return match?.id != null ? Number(match.id) : null
}

const InstituteCurriculum = forwardRef(function InstituteCurriculum(
  { curriculums, setCurriculums, persistenceMode, setActiveNav },
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

  const uploadSubjects = SUBJECTS_BY_GRADE[uploadForm.grade] || []
  const editSubjects = SUBJECTS_BY_GRADE[editForm.grade] || []
  const filterSubjects = useMemo(() => {
    if (filterGrade) return SUBJECTS_BY_GRADE[filterGrade] || []
    const all = Object.values(SUBJECTS_BY_GRADE).flat()
    return [...new Set(all)]
  }, [filterGrade])

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
    const allowedExt = new Set(['pdf', 'doc', 'docx'])
    const allowedMime = new Set([
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ])
    if (!allowedExt.has(ext)) return false
    if (!file.type) return true
    return allowedMime.has(String(file.type).toLowerCase())
  }

  async function submitUpload(e) {
    e.preventDefault()
    setFormError('')
    if (!uploadForm.grade || !uploadForm.subject || !uploadForm.description.trim()) {
      setFormError('Please complete Grade Level, Subject, and Description.')
      return
    }
    if (!uploadForm.file) {
      setFormError('Please choose a curriculum file (DOC/DOCX or PDF).')
      return
    }
    if (!isAllowedCurriculumGuideFile(uploadForm.file)) {
      setFormError('File must be DOC, DOCX, or PDF.')
      return
    }
    setIsUploading(true)
    try {
      const dataUrl = await readFileAsDataUrl(uploadForm.file)
      const newId = crypto.randomUUID()
      let postgresCurriculumId = null

      if (persistenceMode === 'server') {
        const res = await fetch(apiUrl('/api/v1/curriculum'), {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: uploadForm.subject,
            description: uploadForm.description.trim(),
            grade_level: uploadForm.grade,
            file_name: uploadForm.file.name,
            source_id: newId,
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(data?.message || data?.error || `Create failed (${res.status}).`))
        }
        postgresCurriculumId = data?.id != null ? Number(data.id) : null
      }

      const newItem = {
        id: newId,
        postgresCurriculumId,
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
      setUploadForm({ grade: '', subject: '', description: '', file: null })
      setCurriculumPage('manage')
      toast.created('You have created Curriculum Guide.')
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
    let nextFileDataUrl = target.fileDataUrl
    let nextFileName = target.fileName
    let nextFileType = target.fileType
    if (editForm.file) {
      if (!isAllowedCurriculumGuideFile(editForm.file)) {
        setEditingError('File must be DOC, DOCX, or PDF.')
        return
      }
      try {
        nextFileDataUrl = await readFileAsDataUrl(editForm.file)
        nextFileName = editForm.file.name
        nextFileType = editForm.file.type
      } catch (err) {
        setEditingError(err?.message || 'Could not update file.')
        return
      }
    }

    let resolvedPgId = target.postgresCurriculumId ?? null
    if (persistenceMode === 'server') {
      resolvedPgId = await resolveCurriculumPostgresId(target)
      if (!resolvedPgId) {
        setEditingError('Could not resolve curriculum record on the server.')
        return
      }
      try {
        const res = await fetch(apiUrl(`/api/v1/curriculum/${encodeURIComponent(String(resolvedPgId))}`), {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editForm.subject,
            description: editForm.description.trim(),
            grade_level: editForm.grade,
            file_name: nextFileName,
            source_id: String(target.id),
          }),
        })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          setEditingError(String(data?.message || data?.error || `Update failed (${res.status}).`))
          return
        }
      } catch (e) {
        setEditingError(String(e?.message || e || 'Network error updating curriculum.'))
        return
      }
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
              postgresCurriculumId: resolvedPgId ?? item.postgresCurriculumId ?? null,
            }
          : item,
      ),
    )
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
      const rawId = String(target?.id || '').trim()
      if (rawId) {
        try {
          const res = await fetch(apiUrl(`/api/v1/curriculum/${encodeURIComponent(rawId)}`), {
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
        } catch (e) {
          toast.error(String(e?.message || e || 'Network error deleting curriculum.'), {
            title: 'Could not delete curriculum',
            durationMs: 10000,
          })
          return
        }
      }
    }

    setCurriculums((prev) => prev.filter((item) => item.id !== target.id))
    setDeleteTarget(null)
    toast.deleted('You have deleted Curriculum Guide.')
  }

  function previewCard(item) {
    if (String(item.fileType || '').startsWith('image/')) {
      return <img src={item.fileDataUrl} alt={curriculumCardTitle(item)} className="h-44 w-full rounded-lg border object-cover" />
    }
    if (!String(item.fileDataUrl || '').trim()) {
      return (
        <div className="flex h-44 w-full items-center justify-center rounded-lg border bg-neutral-50 p-4 text-center text-sm text-neutral-600">
          No file preview on this device — open View on a machine that has the file, or use another device with the same signed-in account after data has synced.
        </div>
      )
    }
    return (
      <div className="h-44 w-full rounded-lg border bg-white p-2">
        <iframe title={curriculumCardTitle(item)} src={item.fileDataUrl} className="h-full w-full rounded" />
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
                    <option key={subject} value={subject}>
                      {subject}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Curriculum Guide File (DOC/DOCX or PDF)
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
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    className="hidden"
                    onChange={(e) =>
                      setUploadForm((prev) => ({
                        ...prev,
                        file: e.target.files?.[0] || null,
                      }))
                    }
                  />
                </div>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Description
                <textarea
                  className="mt-1 min-h-24 w-full rounded-lg border px-3 py-2"
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm((prev) => ({ ...prev, description: e.target.value }))}
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
          <h2 className="text-xl font-bold text-neutral-900">Edit Curriculum Guide</h2>
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
                  <option key={subject} value={subject}>
                    {subject}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-neutral-700">
              Curriculum Guide File (DOC/DOCX or PDF)
              <div className="mt-1 flex items-center gap-2 rounded-lg border bg-white px-3 py-2 text-sm">
                <label
                  htmlFor="edit-curriculum-file"
                  className="cursor-pointer rounded border border-neutral-400 bg-neutral-100 px-3 py-1 text-sm font-medium text-neutral-800 hover:bg-neutral-200"
                >
                  Choose File
                </label>
                <span className="text-neutral-600">{editForm.file?.name || 'No file chosen'}</span>
                <input
                  id="edit-curriculum-file"
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
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
                Update Curriculum
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
                <option key={subject} value={subject}>
                  {subject}
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
                    <p className="mt-1 text-sm text-neutral-700">{item.description}</p>
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
                      Edit
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
              <img src={viewingItem.fileDataUrl} alt={curriculumCardTitle(viewingItem)} className="max-h-[75vh] w-full object-contain" />
            ) : (
              <iframe title={curriculumCardTitle(viewingItem)} src={viewingItem.fileDataUrl} className="h-[75vh] w-full rounded border" />
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
