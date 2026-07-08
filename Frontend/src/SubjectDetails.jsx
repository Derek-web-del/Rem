import { useEffect, useMemo, useRef, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import SubjectCoverImage from './components/SubjectCoverImage.jsx'
import {
  PREDEFINED_SUBJECT_NAMES,
  resolveSubjectImageFromMap,
} from './lib/subjectImages.js'
import { formatSemesterLabel, SEMESTER_LABELS } from './lib/quizQuestionTypes.js'

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function TextField({ label, required, disabled, value, onChange, type = 'text', helper, placeholder }) {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      <input
        type={type}
        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-neutral-100"
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
        required={required}
      />
      {helper ? <p className="mt-1 text-xs text-neutral-500">{helper}</p> : null}
    </label>
  )
}

function SelectField({ label, required, disabled, value, onChange, children, helper }) {
  return (
    <label className="block text-sm font-medium text-neutral-700">
      {label}
      {required ? <span className="text-red-600"> *</span> : null}
      <select
        className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 disabled:bg-neutral-100"
        value={value}
        onChange={onChange}
        disabled={disabled}
        required={required}
      >
        {children}
      </select>
      {helper ? <p className="mt-1 text-xs text-neutral-500">{helper}</p> : null}
    </label>
  )
}

export default function SubjectDetails({
  mode,
  gradeOptions,
  facultyOptions,
  curriculumGuideOptions = [],
  initial,
  onBack,
  onSave,
  savingLabel = 'Save Changes',
  disableIdentity,
}) {
  const pdfInputRef = useRef(null)
  const blobUrlRef = useRef(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState('')
  const [form, setForm] = useState(() => ({
    subjectCode: initial.subjectCode || '',
    subjectName: initial.subjectName || '',
    grade: initial.grade || '',
    semester: String(initial.semester || '1'),
    semCode: initial.semCode || '',
    assignedFacultyId: initial.assignedFacultyId || '',
    curriculumGuideId: initial.curriculumGuideId || '',
    scheduleDayOfWeek: String(initial.schedule?.day_of_week ?? initial.scheduleDayOfWeek ?? '1'),
    scheduleStartTime: String(initial.schedule?.start_time ?? initial.scheduleStartTime ?? '08:00'),
    scheduleEndTime: String(initial.schedule?.end_time ?? initial.scheduleEndTime ?? '09:00'),
    scheduleRoom: String(initial.schedule?.room ?? initial.scheduleRoom ?? ''),
    syllabusFileName: initial.syllabusFileName || '',
    syllabusFileType: initial.syllabusFileType || '',
    syllabusDataUrl: initial.syllabusDataUrl || '',
  }))

  function revokeBlobPreview() {
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current)
      blobUrlRef.current = null
    }
  }

  function applyPdfPreviewFromExisting(dataUrl) {
    revokeBlobPreview()
    const s = String(dataUrl || '').trim()
    if (s.startsWith('data:application/pdf') || s.startsWith('blob:')) {
      setPdfPreviewUrl(s)
    } else {
      setPdfPreviewUrl('')
    }
  }

  useEffect(() => {
    setForm({
      subjectCode: initial.subjectCode || '',
      subjectName: initial.subjectName || '',
      grade: initial.grade || '',
      semester: String(initial.semester || '1'),
      semCode: initial.semCode || '',
      assignedFacultyId: initial.assignedFacultyId || '',
      curriculumGuideId: initial.curriculumGuideId || '',
      scheduleDayOfWeek: String(initial.schedule?.day_of_week ?? initial.scheduleDayOfWeek ?? '1'),
      scheduleStartTime: String(initial.schedule?.start_time ?? initial.scheduleStartTime ?? '08:00'),
      scheduleEndTime: String(initial.schedule?.end_time ?? initial.scheduleEndTime ?? '09:00'),
      scheduleRoom: String(initial.schedule?.room ?? initial.scheduleRoom ?? ''),
      syllabusFileName: initial.syllabusFileName || '',
      syllabusFileType: initial.syllabusFileType || '',
      syllabusDataUrl: initial.syllabusDataUrl || '',
    })
    applyPdfPreviewFromExisting(initial.syllabusDataUrl)
    setError('')
  }, [initial])

  useEffect(() => () => revokeBlobPreview(), [])

  const faculty = useMemo(
    () => facultyOptions.find((f) => f.id === form.assignedFacultyId) || null,
    [facultyOptions, form.assignedFacultyId],
  )

  const computedSemCode = useMemo(() => {
    const gradeNum = String(form.grade || '').replace(/[^0-9]/g, '')
    const q = String(form.semester || '').trim()
    if (!gradeNum || !q) return ''
    return `${gradeNum.padStart(2, '0')}_${q}`
  }, [form.grade, form.semester])

  useEffect(() => {
    if (!form.semCode) {
      setForm((p) => ({ ...p, semCode: computedSemCode }))
    }
  }, [computedSemCode])

  async function choosePdf(file) {
    if (!file) return
    if (file.type !== 'application/pdf') {
      setError('Syllabus must be a PDF file.')
      return
    }
    revokeBlobPreview()
    const objectUrl = URL.createObjectURL(file)
    blobUrlRef.current = objectUrl
    setPdfPreviewUrl(objectUrl)
    const dataUrl = await readFileAsDataUrl(file)
    setForm((p) => ({
      ...p,
      syllabusDataUrl: dataUrl,
      syllabusFileName: file.name,
      syllabusFileType: file.type,
    }))
    setError('')
  }

  function validate() {
    if (!String(form.subjectCode || '').trim()) return 'Subject Code is required.'
    if (!String(form.subjectName || '').trim()) return 'Subject Name is required.'
    if (!String(form.grade || '').trim()) return 'Subject Grade Level is required.'
    if (!String(form.semester || '').trim()) return 'Subject Semester is required.'
    if (!String(form.assignedFacultyId || '').trim()) return 'Faculty ID is required.'
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    const subjectPhoto = resolveSubjectImageFromMap(form.subjectName)
    const payload = {
      subjectCode: String(form.subjectCode || '').trim(),
      subjectName: String(form.subjectName || '').trim(),
      grade: form.grade,
      semester: Number(form.semester || 1),
      semCode: String(form.semCode || computedSemCode || '').trim() || computedSemCode,
      assignedFacultyId: form.assignedFacultyId,
      assignedFacultyName: faculty?.name || '',
      facultyCode: faculty?.facultyUsername || faculty?.facultyCode || '',
      facultyEmail: faculty?.email || '',
      curriculumGuideId: form.curriculumGuideId,
      scheduleDayOfWeek: form.scheduleDayOfWeek,
      scheduleStartTime: form.scheduleStartTime,
      scheduleEndTime: form.scheduleEndTime,
      scheduleRoom: form.scheduleRoom,
      schedule: {
        day_of_week: Number(form.scheduleDayOfWeek),
        start_time: form.scheduleStartTime,
        end_time: form.scheduleEndTime,
        room: form.scheduleRoom,
      },
      syllabusFileName: form.syllabusFileName,
      syllabusFileType: form.syllabusFileType,
      syllabusDataUrl: form.syllabusDataUrl,
      subjectPhoto,
      subject_photo: subjectPhoto,
      cover_image_url: subjectPhoto,
    }
    setSubmitting(true)
    try {
      const res = await Promise.resolve(onSave(payload))
      if (res?.error) {
        setError(res.error)
        return
      }
      onBack()
    } finally {
      setSubmitting(false)
    }
  }

  const subjectNameOptions = useMemo(() => {
    const options = [...PREDEFINED_SUBJECT_NAMES]
    const current = String(form.subjectName || '').trim()
    if (current && !options.some((n) => n.toLowerCase() === current.toLowerCase())) {
      options.push(current)
    }
    return options
  }, [form.subjectName])

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{mode === 'add' ? 'Add' : 'Edit'}</p>
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Subject Details</h2>
        </div>
        <BackButton onClick={onBack} disabled={submitting} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        {error ? <p className="rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}

        <form onSubmit={submit} className="mt-2 grid gap-6">
          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Subject Code"
              required
              value={form.subjectCode}
              onChange={(e) => setForm((p) => ({ ...p, subjectCode: e.target.value }))}
              disabled={disableIdentity || submitting}
            />
            <SelectField
              label="Subject Name"
              required
              value={form.subjectName}
              onChange={(e) => setForm((p) => ({ ...p, subjectName: e.target.value }))}
              disabled={submitting}
            >
              <option value="">Select Subject</option>
              {subjectNameOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </SelectField>
          </div>

          {form.subjectName ? (
            <div className="flex items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <SubjectCoverImage
                subjectName={form.subjectName}
                alt={form.subjectName}
                className="size-14 rounded-lg border border-neutral-200 object-cover"
              />
              <p className="text-sm text-neutral-600">
                Cover image for <span className="font-semibold text-neutral-900">{form.subjectName}</span> is assigned
                automatically.
              </p>
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Subject Grade Level"
              required
              value={form.grade}
              onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value }))}
              disabled={submitting}
              helper="Students only see subjects that match their enrolled grade level."
            >
              <option value="">Select Grade</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Subject Semester"
              required
              value={form.semester}
              onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value, semCode: '' }))}
              disabled={submitting}
            >
              {[1, 2, 3].map((q) => (
                <option key={q} value={String(q)}>
                  {SEMESTER_LABELS[q]}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Faculty ID"
              required
              value={form.assignedFacultyId}
              onChange={(e) => setForm((p) => ({ ...p, assignedFacultyId: e.target.value }))}
              disabled={facultyOptions.length === 0 || submitting}
              helper="Teachers only see subjects assigned to them in the Teacher portal."
            >
              <option value="">{facultyOptions.length ? 'Select Faculty' : 'No faculty available'}</option>
              {facultyOptions.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                  {f.facultyUsername || f.facultyCode ? ` (${f.facultyUsername || f.facultyCode})` : ''}
                </option>
              ))}
            </SelectField>

            <SelectField
              label="Institute Curriculum Guide"
              value={form.curriculumGuideId}
              onChange={(e) => setForm((p) => ({ ...p, curriculumGuideId: e.target.value }))}
              disabled={submitting}
              helper="Links this subject to a published DepEd-aligned curriculum PDF from the institute library."
            >
              <option value="">
                {curriculumGuideOptions.length ? 'Select curriculum guide (optional)' : 'No published guides yet'}
              </option>
              {curriculumGuideOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.grade} — {g.subject}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Class Schedule</div>
            <p className="mt-1 text-xs text-neutral-600">Day/time schedule for this subject offering (Glendale workflow).</p>
            <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <SelectField
                label="Day"
                value={form.scheduleDayOfWeek}
                onChange={(e) => setForm((p) => ({ ...p, scheduleDayOfWeek: e.target.value }))}
                disabled={submitting}
              >
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </SelectField>
              <TextField
                label="Start time"
                type="time"
                value={form.scheduleStartTime}
                onChange={(e) => setForm((p) => ({ ...p, scheduleStartTime: e.target.value }))}
                disabled={submitting}
              />
              <TextField
                label="End time"
                type="time"
                value={form.scheduleEndTime}
                onChange={(e) => setForm((p) => ({ ...p, scheduleEndTime: e.target.value }))}
                disabled={submitting}
              />
              <TextField
                label="Room"
                value={form.scheduleRoom}
                onChange={(e) => setForm((p) => ({ ...p, scheduleRoom: e.target.value }))}
                disabled={submitting}
                placeholder="Room 201"
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Syllabus"
              disabled
              value={form.syllabusFileName ? form.syllabusFileName : ''}
              onChange={() => {}}
              placeholder="Upload PDF"
              helper={form.syllabusDataUrl ? 'PDF ready to save' : ''}
            />
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="text-sm font-semibold text-neutral-900">Syllabus (PDF)</div>
            <div
              className="mt-3 flex min-h-23 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-center"
              onClick={() => !submitting && pdfInputRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={async (e) => {
                e.preventDefault()
                if (submitting) return
                const file = e.dataTransfer.files?.[0]
                await choosePdf(file)
              }}
              role="button"
              tabIndex={0}
            >
              <input
                ref={pdfInputRef}
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={submitting}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  await choosePdf(file)
                }}
              />
              <div className="text-sm font-medium text-neutral-600">
                Drag &amp; drop your PDF here or <span className="text-blue-700 underline">browse</span>
              </div>
            </div>
            {pdfPreviewUrl ? (
              <iframe src={pdfPreviewUrl} className="mt-2 h-64 w-full rounded border" title="Syllabus Preview" />
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : savingLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}
