import { useEffect, useRef, useState } from 'react'

import { useNavigate, useOutletContext, useParams } from 'react-router-dom'

import { apiUrl } from '../../lib/lmsStateStorage.js'

import {

  createFacultyStudyMaterial,

  fetchFacultyStudyMaterial,

  formatMaterialSizeLabel,

  updateFacultyStudyMaterial,

} from '../../lib/facultyStudyMaterials.js'

import {

  FACULTY_MSG,

  FACULTY_TOAST_ID,

  FACULTY_ANNOUNCEMENT_TOAST_MS,

  useFacultyNotify,

} from '../../lib/facultyNotify.js'

import TeacherMainHeader from './TeacherMainHeader.jsx'

import BackButton from '../../components/BackButton.jsx'

import { ACTION_BLUE } from './instituteChrome.js'

import {
  STUDY_MATERIAL_MAX_BYTES,
  STUDY_MATERIAL_MAX_MSG,
  STUDY_MATERIAL_UPLOAD_LABEL,
} from '../../lib/uploadLimits.js'



const MAX_FILE_BYTES = STUDY_MATERIAL_MAX_BYTES

const ACCEPT = '.pdf,application/pdf'

const GRADE_OPTIONS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']



function subjectOptionLabel(sub) {

  const code = String(sub?.subject_code || '').trim()

  const name = String(sub?.subject_name || '').trim()

  if (code && name) return `${code} — ${name}`

  return code || name || 'Subject'

}



function subjectOptionValue(sub) {

  return String(sub?.subject_code || sub?.subject_name || '').trim()

}



function FileIcon({ className }) {

  return (

    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>

      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />

      <path d="M14 2v6h6" />

    </svg>

  )

}



export default function TeacherFacultyStudyMaterialForm({ mode = 'add' }) {

  const isEdit = mode === 'edit'

  const { id } = useParams()

  const navigate = useNavigate()

  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}

  const toast = useFacultyNotify()

  const toastRef = useRef(toast)

  toastRef.current = toast

  const fileRef = useRef(null)

  const mountedRef = useRef(true)



  useEffect(() => {

    mountedRef.current = true

    return () => {

      mountedRef.current = false

    }

  }, [])



  const [loading, setLoading] = useState(isEdit)

  const [submitting, setSubmitting] = useState(false)

  const [file, setFile] = useState(null)

  const [existing, setExisting] = useState(null)

  const [subjects, setSubjects] = useState([])

  const [form, setForm] = useState({ title: '', grade_level: '', subject: '' })



  useEffect(() => {

    setSidebarNavLocked?.(false)

  }, [setSidebarNavLocked])



  useEffect(() => {

    let cancelled = false

    ;(async () => {

      try {

        const res = await fetch(apiUrl('/api/teacher/subjects'), { credentials: 'include' })

        const data = await res.json().catch(() => [])

        if (!cancelled && res.ok && Array.isArray(data)) setSubjects(data)

      } catch {

        /* optional catalog */

      }

    })()

    return () => {

      cancelled = true

    }

  }, [])



  useEffect(() => {

    if (!isEdit || !id) return

    let cancelled = false

    ;(async () => {

      setLoading(true)

      try {

        const row = await fetchFacultyStudyMaterial(id)

        if (cancelled) return

        if (!row) {

          toastRef.current.error(FACULTY_MSG.studyMaterial.updateFailed, {

            toastId: 'study-material-edit-error',

            durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

          })

          navigate('/teacher/study-materials')

          return

        }

        setExisting(row)

        setForm({

          title: row.title || '',

          grade_level: row.grade_level || '',

          subject: row.subject || '',

        })

      } catch (e) {

        console.error('[TeacherFacultyStudyMaterialForm]', e)

        if (!cancelled) {

          toastRef.current.error(FACULTY_MSG.studyMaterial.loadFailed, {

            toastId: 'study-material-edit-error',

            durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

          })

          navigate('/teacher/study-materials', { replace: true })

        }

      } finally {

        if (!cancelled) setLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [isEdit, id, navigate])



  function isPdfFile(next) {

    const ext = next.name.split('.').pop()?.toLowerCase() || ''

    const mime = String(next.type || '').toLowerCase()

    return ext === 'pdf' || mime === 'application/pdf'

  }



  function onFilePick(next) {

    if (!next) {

      setFile(null)

      return

    }

    if (!isPdfFile(next)) {

      toastRef.current.error(FACULTY_MSG.studyMaterial.fileType, {

        toastId: 'study-material-file-type-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return

    }

    if (next.size > MAX_FILE_BYTES) {

      toastRef.current.error(FACULTY_MSG.studyMaterial.fileSize, {

        toastId: 'study-material-file-size-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return

    }

    setFile(next)

  }



  function onSubjectChange(value) {

    setForm((p) => {

      const next = { ...p, subject: value }

      if (!p.grade_level && value) {

        const match = subjects.find((s) => subjectOptionValue(s) === value)

        if (match?.grade_level) next.grade_level = String(match.grade_level).trim()

      }

      return next

    })

  }



  function validate() {

    if (!String(form.title || '').trim()) {

      toastRef.current.error('Study material title is required.', {

        toastId: 'study-material-add-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.grade_level || '').trim()) {

      toastRef.current.error('Please select a Grade Level.', {

        toastId: FACULTY_TOAST_ID.assignmentGradeError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.subject || '').trim()) {

      toastRef.current.error('Please select a Subject.', {

        toastId: 'study-material-subject-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!isEdit && !file) {

      toastRef.current.error('Please upload a PDF file.', {

        toastId: 'study-material-add-error',

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (file) {

      if (!isPdfFile(file)) {

        toastRef.current.error(FACULTY_MSG.studyMaterial.fileType, {

          toastId: 'study-material-file-type-error',

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

        return false

      }

      if (file.size > MAX_FILE_BYTES) {

        toastRef.current.error(FACULTY_MSG.studyMaterial.fileSize, {

          toastId: 'study-material-file-size-error',

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

        return false

      }

    }

    return true

  }



  async function handleSubmit(ev) {

    ev.preventDefault()

    if (!validate()) return

    setSubmitting(true)

    try {

      const fd = new FormData()

      fd.append('title', form.title.trim())

      fd.append('grade_level', form.grade_level.trim())

      fd.append('subject', form.subject.trim())

      if (file) fd.append('file', file)



      if (isEdit) {

        await updateFacultyStudyMaterial(id, fd)

        toastRef.current.success(FACULTY_MSG.studyMaterial.updated, {

          toastId: 'study-material-edit-success',

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      } else {

        await createFacultyStudyMaterial(fd)

        toastRef.current.success(FACULTY_MSG.studyMaterial.added, {

          toastId: 'study-material-add-success',

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      }

      navigate('/teacher/study-materials', { replace: true, state: { refreshMaterials: true } })

    } catch (e) {

      const msg = String(e?.message || e)

      toastRef.current.error(

        isEdit

          ? FACULTY_MSG.studyMaterial.updateFailed

          : msg.includes('File too large') || msg.includes('Maximum size') || msg.includes('exceed')

            ? FACULTY_MSG.studyMaterial.fileSize

            : msg.includes('PDF')

              ? FACULTY_MSG.studyMaterial.fileType

              : FACULTY_MSG.studyMaterial.addFailed,

        {

          toastId: isEdit ? 'study-material-edit-error' : 'study-material-add-error',

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        },

      )

    } finally {

      if (mountedRef.current) setSubmitting(false)

    }

  }



  const existingLabel = existing

    ? `${existing.file_name || 'File'} • ${formatMaterialSizeLabel(existing)} • Click to replace`

    : ''



  const subjectOptions = subjects.length

    ? subjects

    : form.subject

      ? [{ subject_code: form.subject, subject_name: form.subject }]

      : []



  return (

    <>

      <TeacherMainHeader pageTitle="Study Materials" onLogout={logoutToPortal} />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">

        <div className="mx-auto max-w-xl">

          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">

            <div>

              <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">

                {isEdit ? 'EDIT' : 'ADD NEW'}

              </p>

              <h2 className="mt-1 text-2xl font-bold text-neutral-900">Study Material</h2>

            </div>

            <BackButton to="/teacher/study-materials" className="" />

          </div>



          {loading ? (

            <p className="py-12 text-center text-sm text-neutral-500">Loading material…</p>

          ) : (

            <form onSubmit={(ev) => void handleSubmit(ev)} className="mt-6 space-y-6">

              {isEdit && existing && !file ? (

                <div

                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-4"

                  onClick={() => fileRef.current?.click()}

                  role="button"

                  tabIndex={0}

                  onKeyDown={(ev) => {

                    if (ev.key === 'Enter' || ev.key === ' ') fileRef.current?.click()

                  }}

                >

                  <FileIcon className="h-8 w-8 text-neutral-400" />

                  <div>

                    <p className="text-sm font-semibold text-neutral-800">{existing.file_name || 'Current file'}</p>

                    <p className="text-xs text-neutral-500">{existingLabel}</p>

                  </div>

                </div>

              ) : (

                <div

                  className="flex min-h-[140px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center"

                  onClick={() => fileRef.current?.click()}

                  onDragOver={(ev) => ev.preventDefault()}

                  onDrop={(ev) => {

                    ev.preventDefault()

                    onFilePick(ev.dataTransfer.files?.[0])

                  }}

                  role="button"

                  tabIndex={0}

                  onKeyDown={(ev) => {

                    if (ev.key === 'Enter' || ev.key === ' ') fileRef.current?.click()

                  }}

                >

                  <FileIcon className="mb-2 h-8 w-8 text-neutral-400" />

                  <p className="text-sm text-neutral-600">

                    Drag &amp; drop or <span className="font-semibold text-sky-600">click to select</span>

                  </p>

                  <p className="mt-1 text-xs text-neutral-500">{STUDY_MATERIAL_UPLOAD_LABEL}</p>

                  <p className="mt-2 text-xs font-medium text-neutral-600">

                    {file ? file.name : isEdit ? 'No new file chosen' : 'No file chosen'}

                  </p>

                </div>

              )}



              <input

                ref={fileRef}

                type="file"

                accept={ACCEPT}

                className="hidden"

                onChange={(ev) => {

                  onFilePick(ev.target.files?.[0])

                  ev.target.value = ''

                }}

              />



              {isEdit && existing && file ? (

                <p className="text-xs text-neutral-500">

                  Replacing: <span className="font-medium text-neutral-700">{file.name}</span>

                </p>

              ) : null}



              <label className="block text-sm font-medium text-neutral-700">

                Study Material Title

                <input

                  type="text"

                  placeholder="Enter material title..."

                  className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                  value={form.title}

                  onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}

                  required

                />

              </label>



              <label className="block text-sm font-medium text-neutral-700">

                Subject

                <select

                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                  value={form.subject}

                  onChange={(e) => onSubjectChange(e.target.value)}

                  required

                >

                  <option value="">Select Subject</option>

                  {subjectOptions.map((sub) => {

                    const value = subjectOptionValue(sub)

                    if (!value) return null

                    return (

                      <option key={value} value={value}>

                        {subjectOptionLabel(sub)}

                      </option>

                    )

                  })}

                </select>

              </label>



              <label className="block text-sm font-medium text-neutral-700">

                Grade Level

                <select

                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                  value={form.grade_level}

                  onChange={(e) => setForm((p) => ({ ...p, grade_level: e.target.value }))}

                  required

                >

                  <option value="">Select Grade Level</option>

                  {GRADE_OPTIONS.map((grade) => (

                    <option key={grade} value={grade}>

                      {grade}

                    </option>

                  ))}

                </select>

              </label>



              <button

                type="submit"

                disabled={submitting}

                className="w-full rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"

                style={{ backgroundColor: ACTION_BLUE }}

              >

                {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Material'}

              </button>

            </form>

          )}

        </div>

      </main>

    </>

  )

}

