import { useEffect, useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import SubjectCoverImage from './components/SubjectCoverImage.jsx'
import AdminSubjectCurriculumPanel from './components/admin/AdminSubjectCurriculumPanel.jsx'
import {
  PREDEFINED_SUBJECT_NAMES,
  resolveSubjectImageFromMap,
} from './lib/subjectImages.js'
import { formatSemesterLabel, SEMESTER_LABELS } from './lib/quizQuestionTypes.js'
import {
  WEEKDAY_OPTIONS,
  formatSubjectScheduleLabel,
  scheduleDaysFromSubject,
  scheduleTimesFromSubject,
} from './lib/subjectScheduleDisplay.js'

function normalizeSubjectKey(name) {
  return String(name || '').trim().toLowerCase()
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
  postgresSubjectId = '',
}) {
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState(() => {
    const times = scheduleTimesFromSubject(initial)
    return {
      subjectCode: initial.subjectCode || '',
      subjectName: initial.subjectName || '',
      grade: initial.grade || '',
      semester: String(initial.semester || '1'),
      semCode: initial.semCode || '',
      assignedFacultyId: initial.assignedFacultyId || '',
      curriculumGuideId: initial.curriculumGuideId || '',
      scheduleDays: scheduleDaysFromSubject(initial).length ? scheduleDaysFromSubject(initial) : ['1'],
      scheduleStartTime: times.scheduleStartTime,
      scheduleEndTime: times.scheduleEndTime,
      scheduleRoom: times.scheduleRoom,
    }
  })

  useEffect(() => {
    const times = scheduleTimesFromSubject(initial)
    setForm({
      subjectCode: initial.subjectCode || '',
      subjectName: initial.subjectName || '',
      grade: initial.grade || '',
      semester: String(initial.semester || '1'),
      semCode: initial.semCode || '',
      assignedFacultyId: initial.assignedFacultyId || '',
      curriculumGuideId: initial.curriculumGuideId || '',
      scheduleDays: scheduleDaysFromSubject(initial).length ? scheduleDaysFromSubject(initial) : ['1'],
      scheduleStartTime: times.scheduleStartTime,
      scheduleEndTime: times.scheduleEndTime,
      scheduleRoom: times.scheduleRoom,
    })
    setError('')
  }, [initial])

  const faculty = useMemo(
    () => facultyOptions.find((f) => f.id === form.assignedFacultyId) || null,
    [facultyOptions, form.assignedFacultyId],
  )

  const matchingCurriculumGuides = useMemo(() => {
    const grade = String(form.grade || '').trim()
    const subject = normalizeSubjectKey(form.subjectName)
    const list = Array.isArray(curriculumGuideOptions) ? curriculumGuideOptions : []
    if (!grade && !subject) return list
    return list.filter((g) => {
      const gGrade = String(g.grade ?? g.grade_level ?? '').trim()
      const gSubject = normalizeSubjectKey(g.subject ?? g.title)
      if (grade && gGrade && gGrade !== grade) return false
      if (subject && gSubject && gSubject !== subject) return false
      return true
    })
  }, [curriculumGuideOptions, form.grade, form.subjectName])

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

  function validate() {
    if (!String(form.subjectCode || '').trim()) return 'Subject Code is required.'
    if (!String(form.subjectName || '').trim()) return 'Subject Name is required.'
    if (!String(form.grade || '').trim()) return 'Subject Grade Level is required.'
    if (!String(form.semester || '').trim()) return 'Subject Semester is required.'
    if (!String(form.assignedFacultyId || '').trim()) return 'Faculty ID is required.'
    if (!form.scheduleDays.length) return 'Select at least one weekday for the class schedule.'
    if (!String(form.scheduleStartTime || '').trim() || !String(form.scheduleEndTime || '').trim()) {
      return 'Class start and end time are required.'
    }
    if (String(form.scheduleStartTime) >= String(form.scheduleEndTime)) {
      return 'Class end time must be after the start time.'
    }
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
      scheduleDays: form.scheduleDays,
      scheduleStartTime: form.scheduleStartTime,
      scheduleEndTime: form.scheduleEndTime,
      scheduleRoom: form.scheduleRoom,
      schedule: {
        days: form.scheduleDays.map(Number),
        start_time: form.scheduleStartTime,
        end_time: form.scheduleEndTime,
        room: form.scheduleRoom,
      },
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
            >
              <option value="">
                {matchingCurriculumGuides.length ? 'Select curriculum guide (optional)' : 'No matching guides — upload in Curriculum first'}
              </option>
              {matchingCurriculumGuides.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.grade} — {g.subject}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-4">
            <div className="text-sm font-semibold text-neutral-900">Class Schedule</div>
            <p className="mt-1 text-xs text-neutral-600">Select weekdays (Monday–Friday), then set the class time and room.</p>
            <div className="mt-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-neutral-700">
                  Weekdays<span className="text-red-600"> *</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={submitting}
                    className="rounded-lg border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800 hover:bg-blue-100 disabled:opacity-60"
                    onClick={() =>
                      setForm((prev) => ({
                        ...prev,
                        scheduleDays: WEEKDAY_OPTIONS.map((d) => d.value),
                      }))
                    }
                  >
                    Select all Mon–Fri
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    className="rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-50 disabled:opacity-60"
                    onClick={() => setForm((prev) => ({ ...prev, scheduleDays: [] }))}
                  >
                    Clear all
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {WEEKDAY_OPTIONS.map((day) => {
                  const checked = form.scheduleDays.includes(day.value)
                  return (
                    <label
                      key={day.value}
                      className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm ${
                        checked
                          ? 'border-blue-300 bg-blue-50 text-blue-900'
                          : 'border-neutral-200 bg-white text-neutral-700 hover:border-neutral-300'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="rounded border-neutral-300 text-blue-600 focus:ring-blue-500"
                        checked={checked}
                        disabled={submitting}
                        onChange={() => {
                          setForm((prev) => {
                            const set = new Set(prev.scheduleDays)
                            if (set.has(day.value)) set.delete(day.value)
                            else set.add(day.value)
                            return {
                              ...prev,
                              scheduleDays: [...set].sort((a, b) => Number(a) - Number(b)),
                            }
                          })
                        }}
                      />
                      {day.label}
                    </label>
                  )
                })}
              </div>
              {form.scheduleDays.length ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Preview: {formatSubjectScheduleLabel({
                    schedules: form.scheduleDays.map((day) => ({
                      day_of_week: Number(day),
                      start_time: form.scheduleStartTime,
                      end_time: form.scheduleEndTime,
                      room: form.scheduleRoom,
                    })),
                  })}
                </p>
              ) : (
                <p className="mt-2 text-xs text-amber-700">Select at least one weekday.</p>
              )}
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <TextField
                label="Start time"
                type="time"
                required
                value={form.scheduleStartTime}
                onChange={(e) => setForm((p) => ({ ...p, scheduleStartTime: e.target.value }))}
                disabled={submitting}
              />
              <TextField
                label="End time"
                type="time"
                required
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

      {mode === 'edit' && postgresSubjectId ? (
        <AdminSubjectCurriculumPanel postgresSubjectId={postgresSubjectId} />
      ) : null}
    </div>
  )
}
