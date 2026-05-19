import { useEffect, useRef, useState } from 'react'

import { useNavigate, useOutletContext, useParams } from 'react-router-dom'

import BackButton from '../../components/BackButton.jsx'

import {

  combineDateAndTimeToIso,

  createTeacherAssignment,

  fetchAssignmentFormOptions,

  fetchTeacherAssignment,

  splitDeadlineToDateAndTime,

  updateTeacherAssignment,

} from '../../lib/teacherAssignments.js'

import {

  FACULTY_MSG,

  FACULTY_TOAST_ID,

  FACULTY_ANNOUNCEMENT_TOAST_MS,

  useFacultyNotify,

} from '../../lib/facultyNotify.js'

import TeacherMainHeader from './TeacherMainHeader.jsx'

import { ACTION_BLUE } from './instituteChrome.js'



const MAX_FILE_BYTES = 10 * 1024 * 1024
const ACCEPT = '.pdf,.doc,.docx'
const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

const FALLBACK_SUBJECTS = ['English', 'Math', 'Science', 'Filipino']

const FALLBACK_GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']
const QUARTER_OPTIONS = ['1', '2', '3', '4']



export default function TeacherAssignmentForm({ mode = 'add' }) {

  const isEdit = mode === 'edit'

  const { id } = useParams()

  const navigate = useNavigate()

  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}

  const toast = useFacultyNotify()

  const toastRef = useRef(toast)

  toastRef.current = toast

  const fileRef = useRef(null)



  const [subjectOptions, setSubjectOptions] = useState(FALLBACK_SUBJECTS)

  const [gradeOptions, setGradeOptions] = useState(FALLBACK_GRADES)

  const [loading, setLoading] = useState(isEdit)

  const [submitting, setSubmitting] = useState(false)

  const [file, setFile] = useState(null)

  const [existingFileName, setExistingFileName] = useState('')

  const [form, setForm] = useState({

    title: '',

    subject_name: '',

    grade_level: '',

    quarter: '',

    description: '',

    submission_date: '',

    submission_time: '',

    total_score: '100',

  })



  useEffect(() => {

    setSidebarNavLocked?.(false)

  }, [setSidebarNavLocked])



  useEffect(() => {

    let cancelled = false

    ;(async () => {

      try {

        const options = await fetchAssignmentFormOptions()

        if (cancelled) return

        if (options.subjects.length) setSubjectOptions(options.subjects)

        if (options.gradeLevels.length) setGradeOptions(options.gradeLevels)

      } catch (e) {

        console.error('[TeacherAssignmentForm] options', e)

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

        const row = await fetchTeacherAssignment(id)

        if (cancelled) return

        const { date, time } = splitDeadlineToDateAndTime(row.submission_deadline)

        setForm({

          title: row.title || '',

          subject_name: row.subject_name || '',

          grade_level: row.grade_level || '',

          quarter: row.quarter != null && String(row.quarter).trim() !== '' ? String(row.quarter) : '',

          description: row.description || '',

          submission_date: date,

          submission_time: time,

          total_score: String(row.total_score ?? 100),

        })

        setExistingFileName(row.file_name || '')

      } catch (e) {

        console.error('[TeacherAssignmentForm]', e)

        toastRef.current.error(FACULTY_MSG.assignments.updateFailed, {

          toastId: FACULTY_TOAST_ID.assignmentEditError,

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      } finally {

        if (!cancelled) setLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [isEdit, id])



  function onFilePick(next) {
    if (!next) {
      setFile(null)
      return
    }
    const ext = next.name.split('.').pop()?.toLowerCase() || ''
    const mimeOk = ALLOWED_FILE_TYPES.includes(next.type)
    const extOk = ['pdf', 'doc', 'docx'].includes(ext)
    if (!mimeOk && !extOk) {
      toastRef.current.error(FACULTY_MSG.assignments.fileType, {
        toastId: FACULTY_TOAST_ID.assignmentFileTypeError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return
    }
    if (next.size > MAX_FILE_BYTES) {
      toastRef.current.error(FACULTY_MSG.assignments.fileSize, {
        toastId: FACULTY_TOAST_ID.assignmentFileSizeError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return
    }
    setFile(next)
  }



  function validate() {

    if (!String(form.title || '').trim()) {

      toastRef.current.error('Assignment title is required.', {

        toastId: FACULTY_TOAST_ID.assignmentAddError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.subject_name || '').trim()) {

      toastRef.current.error(FACULTY_MSG.assignments.subjectRequired, {

        toastId: FACULTY_TOAST_ID.assignmentSubjectError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.grade_level || '').trim()) {

      toastRef.current.error(FACULTY_MSG.assignments.gradeRequired, {

        toastId: FACULTY_TOAST_ID.assignmentGradeError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.quarter || '').trim()) {

      toastRef.current.error(FACULTY_MSG.assignments.quarterRequired, {

        toastId: FACULTY_TOAST_ID.quarterRequiredError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    const quarterNum = Number.parseInt(String(form.quarter).trim(), 10)

    if (!Number.isFinite(quarterNum) || quarterNum < 1 || quarterNum > 4) {

      toastRef.current.error(FACULTY_MSG.assignments.quarterRequired, {

        toastId: FACULTY_TOAST_ID.quarterRequiredError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!String(form.submission_date || '').trim() || !String(form.submission_time || '').trim()) {

      toastRef.current.error('Submission date is required.', {

        toastId: FACULTY_TOAST_ID.assignmentAddError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!combineDateAndTimeToIso(form.submission_date, form.submission_time)) {

      toastRef.current.error('Submission date and time are invalid.', {

        toastId: FACULTY_TOAST_ID.assignmentAddError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    const total = Number(form.total_score)

    if (!Number.isFinite(total) || total <= 0) {

      toastRef.current.error('Total score must be a positive number.', {

        toastId: FACULTY_TOAST_ID.assignmentAddError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (!isEdit && !file) {

      toastRef.current.error('Assignment file is required.', {

        toastId: FACULTY_TOAST_ID.assignmentAddError,

        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

      })

      return false

    }

    if (file) {
      const ext = file.name.split('.').pop()?.toLowerCase() || ''
      const mimeOk = ALLOWED_FILE_TYPES.includes(file.type)
      const extOk = ['pdf', 'doc', 'docx'].includes(ext)
      if (!mimeOk && !extOk) {
        toastRef.current.error(FACULTY_MSG.assignments.fileType, {
          toastId: FACULTY_TOAST_ID.assignmentFileTypeError,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
        return false
      }
      if (file.size > MAX_FILE_BYTES) {
        toastRef.current.error(FACULTY_MSG.assignments.fileSize, {
          toastId: FACULTY_TOAST_ID.assignmentFileSizeError,
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

      fd.append('description', form.description.trim())

      fd.append('subject_name', form.subject_name.trim())

      fd.append('grade_level', form.grade_level.trim())

      fd.append('quarter', String(form.quarter).trim())

      fd.append('total_score', String(form.total_score))

      const iso = combineDateAndTimeToIso(form.submission_date, form.submission_time)

      fd.append('submission_deadline', iso)

      if (file) fd.append('file', file)



      if (isEdit) {

        await updateTeacherAssignment(id, fd)

        toastRef.current.success(FACULTY_MSG.assignments.updated, {

          toastId: FACULTY_TOAST_ID.assignmentEditSuccess,

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      } else {

        await createTeacherAssignment(fd)

        toastRef.current.success(FACULTY_MSG.assignments.added, {

          toastId: FACULTY_TOAST_ID.assignmentAddSuccess,

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      }

      navigate('/teacher/assignments')

    } catch (e) {

      const msg = String(e?.message || e)

      if (isEdit) {

        toastRef.current.error(FACULTY_MSG.assignments.updateFailed, {

          toastId: FACULTY_TOAST_ID.assignmentEditError,

          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,

        })

      } else {

        toastRef.current.error(
          msg.includes('10MB') || msg.includes('exceed')
            ? FACULTY_MSG.assignments.fileSize
            : msg.includes('PDF') || msg.includes('DOC')
              ? FACULTY_MSG.assignments.fileType
              : FACULTY_MSG.assignments.addFailed,
          {
            toastId:
              msg.includes('10MB') || msg.includes('exceed')
                ? FACULTY_TOAST_ID.assignmentFileSizeError
                : msg.includes('PDF') || msg.includes('DOC')
                  ? FACULTY_TOAST_ID.assignmentFileTypeError
                  : FACULTY_TOAST_ID.assignmentAddError,
            durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
          },
        )

      }

    } finally {

      setSubmitting(false)

    }

  }



  return (

    <>

      <TeacherMainHeader pageTitle="Assignments" onLogout={logoutToPortal} />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">

        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-neutral-200 pb-4">

          <div>

            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">{isEdit ? 'EDIT' : 'ADD NEW'}</p>

            <h2 className="mt-1 text-2xl font-bold text-neutral-900">Assignment</h2>

          </div>

          <BackButton to="/teacher/assignments" className="" />

        </div>



        {loading ? (

          <p className="py-12 text-center text-sm text-neutral-500">Loading assignment…</p>

        ) : (

          <form onSubmit={(ev) => void handleSubmit(ev)} className="mt-6 space-y-6">

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">

              <div>

                <p className="text-sm font-bold text-neutral-900">Assignment File</p>
                <p className="mt-1 text-sm text-neutral-500">Allowed: PDF, DOC, DOCX</p>
                <p className="text-sm text-neutral-500">Maximum file size: 10MB</p>

              </div>

              <div>

                <div

                  className="flex min-h-[120px] cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-neutral-300 bg-neutral-50 px-4 py-6 text-center"

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

                  <p className="text-sm text-neutral-600">

                    Drag and drop file here or{' '}

                    <span className="font-semibold text-sky-600">click to select</span>

                  </p>

                  <p className="mt-2 text-xs text-neutral-500">{file ? file.name : existingFileName || 'No file chosen'}</p>

                </div>

              </div>

            </div>



            <label className="block text-sm font-medium text-neutral-700">

              Assignment Title

              <input

                type="text"

                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                value={form.title}

                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}

                required

              />

            </label>



            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

              <label className="block text-sm font-medium text-neutral-700">

                Assignment Subject

                <select

                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                  value={form.subject_name}

                  onChange={(e) => setForm((p) => ({ ...p, subject_name: e.target.value }))}

                  required

                >

                  <option value="">Select Subject</option>

                  {subjectOptions.map((name) => (

                    <option key={name} value={name}>

                      {name}

                    </option>

                  ))}

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

                  {gradeOptions.map((grade) => (

                    <option key={grade} value={grade}>

                      {grade}

                    </option>

                  ))}

                </select>

              </label>

              <label className="block text-sm font-medium text-neutral-700">

                Quarter

                <select

                  className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                  value={form.quarter}

                  onChange={(e) => setForm((p) => ({ ...p, quarter: e.target.value }))}

                  required

                >

                  <option value="">Select Quarter</option>

                  {QUARTER_OPTIONS.map((q) => (

                    <option key={q} value={q}>

                      {q}

                    </option>

                  ))}

                </select>

              </label>

            </div>



            <label className="block text-sm font-medium text-neutral-700">

              Assignment Description

              <textarea

                rows={4}

                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                value={form.description}

                onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}

              />

            </label>



            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">

              <div />

              <div className="space-y-4">

                <label className="block text-sm font-medium text-neutral-700">

                  Submission Date

                  <div className="relative mt-1">

                    <input

                      type="date"

                      placeholder="Select Date"

                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                      value={form.submission_date}

                      onChange={(e) => setForm((p) => ({ ...p, submission_date: e.target.value }))}

                      required

                    />

                    <i

                      className="ti ti-calendar pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"

                      aria-hidden="true"

                    />

                  </div>

                </label>



                <label className="block text-sm font-medium text-neutral-700">

                  Time

                  <div className="relative mt-1">

                    <input

                      type="time"

                      placeholder="Select Time"

                      className="w-full rounded-lg border border-neutral-200 px-3 py-2 pr-10 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                      value={form.submission_time}

                      onChange={(e) => setForm((p) => ({ ...p, submission_time: e.target.value }))}

                      required

                    />

                    <i

                      className="ti ti-clock pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400"

                      aria-hidden="true"

                    />

                  </div>

                </label>

              </div>

            </div>



            <label className="block max-w-xs text-sm font-medium text-neutral-700">

              Total Score

              <input

                type="number"

                min={1}

                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"

                value={form.total_score}

                onChange={(e) => setForm((p) => ({ ...p, total_score: e.target.value }))}

                required

              />

            </label>



            <button

              type="submit"

              disabled={submitting}

              className="rounded-lg px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"

              style={{ backgroundColor: ACTION_BLUE }}

            >

              {submitting ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Assignment'}

            </button>

          </form>

        )}

      </main>

    </>

  )

}


