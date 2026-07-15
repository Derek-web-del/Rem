import { useEffect, useMemo, useRef, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import StudentDetails from './StudentDetails.jsx'
import StudentProfile from './StudentProfile.jsx'
import { useNotify } from './components/notifications.jsx'
import { facultyPhotoDisplaySrc } from './lib/facultyPhoto.js'
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_MSG, PHOTO_UPLOAD_LABEL } from './lib/uploadLimits.js'
import { TruncatedTableCell } from './lib/tableCellDisplay.jsx'

function FilterIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 4h18l-7 8v6l-4 2v-8z" />
    </svg>
  )
}

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function TextField({ label, required, helper, disabled, value, onChange, type = 'text', placeholder }) {
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

function SelectField({ label, required, disabled, value, onChange, children }) {
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
    </label>
  )
}

function StudentDetailsLegacy({
  mode,
  sections,
  gradeOptions,
  initial,
  onBack,
  onSave,
  savingLabel,
  disableIdentity,
}) {
  const fileInputRef = useRef(null)
  const [error, setError] = useState('')
  const [passwordModalOpen, setPasswordModalOpen] = useState(false)
  const [pendingPassword, setPendingPassword] = useState('')
  const [form, setForm] = useState(() => ({
    photoDataUrl: initial.photoDataUrl || '',
    firstName: initial.firstName || '',
    middleName: initial.middleName || '',
    lastName: initial.lastName || '',
    email: initial.email || '',
    studentContactNumber: initial.studentContactNumber || initial.phone || '',
    studentAddress: initial.studentAddress || '',
    dateOfBirth: initial.dateOfBirth || '',
    parentContactNumber: initial.parentContactNumber || '',
    parentEmail: initial.parentEmail || '',
    enrollmentNo: initial.enrollmentNo || '',
    rollNo: initial.rollNo || '',
    grade: initial.grade || '',
    semester: initial.semester || '1',
    sectionId: initial.sectionId || '',
    password: initial.password || '',
  }))

  const sectionForId = useMemo(() => sections.find((s) => s.id === form.sectionId) || null, [sections, form.sectionId])

  useEffect(() => {
    setForm({
      photoDataUrl: initial.photoDataUrl || '',
      firstName: initial.firstName || '',
      middleName: initial.middleName || '',
      lastName: initial.lastName || '',
      email: initial.email || '',
      studentContactNumber: initial.studentContactNumber || initial.phone || '',
      studentAddress: initial.studentAddress || '',
      dateOfBirth: initial.dateOfBirth || '',
      parentContactNumber: initial.parentContactNumber || '',
      parentEmail: initial.parentEmail || '',
      enrollmentNo: initial.enrollmentNo || '',
      rollNo: initial.rollNo || '',
      grade: initial.grade || '',
      semester: initial.semester || '1',
      sectionId: initial.sectionId || '',
      password: initial.password || '',
    })
    setError('')
  }, [initial])

  const sectionOptions = useMemo(() => {
    return form.grade ? sections.filter((s) => s.grade === form.grade) : sections
  }, [sections, form.grade])

  async function choosePhoto(file) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError('Only PNG/JPG images are allowed.')
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setError(PROFILE_PHOTO_MAX_MSG)
      return
    }
    const dataUrl = await readFileAsDataUrl(file)
    setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }))
  }

  function validate() {
    const required = [
      ['firstName', 'First name'],
      ['lastName', 'Last name'],
      ['email', 'Student Email address'],
      ['studentContactNumber', 'Student Contact Number'],
      ['studentAddress', 'Student Address'],
      ['dateOfBirth', 'Date of Birth'],
      ['parentContactNumber', "Parent's Contact Number"],
      ['parentEmail', "Parent's Email"],
      ['enrollmentNo', 'Student Enrollment No'],
      ['rollNo', 'Student Roll No'],
      ['grade', 'Student Grade Level'],
      ['semester', 'Student Semester'],
      ['sectionId', 'Student Section'],
    ]
    for (const [key, label] of required) {
      if (!String(form[key] || '').trim()) return `${label} is required.`
    }
    const email = String(form.email || '').trim()
    if (!email.includes('@')) return 'Please enter a valid student email.'
    const pEmail = String(form.parentEmail || '').trim()
    if (!pEmail.includes('@')) return 'Please enter a valid parent email.'
    const section = sections.find((s) => s.id === form.sectionId)
    if (!section) return 'Please select a valid section.'
    if (section.grade !== form.grade) return 'Selected section does not match grade level.'
    return ''
  }

  function handleSubmit(e) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    const section = sections.find((s) => s.id === form.sectionId)
    const res = onSave({
      ...form,
      parentEmail: String(form.parentEmail || '').trim().toLowerCase(),
      email: String(form.email || '').trim().toLowerCase(),
      grade: section.grade,
      sectionId: section.id,
      sectionName: section.name,
    })
    if (res?.error) {
      setError(res.error)
      return
    }
    onBack()
  }

  const loginId = String(form.email || '').trim().toLowerCase()

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{mode === 'add' ? 'Add' : 'Edit'}</p>
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Student Details</h2>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-neutral-200">
              {form.photoDataUrl ? (
                <img src={form.photoDataUrl} alt="Student" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-600">
                  {initials(`${form.firstName} ${form.lastName}`)}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Student Photo</div>
              <div className="text-xs text-neutral-500">{PHOTO_UPLOAD_LABEL}</div>
            </div>
          </div>

          <div
            className="flex min-h-24 flex-1 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 bg-neutral-50 px-4 py-4 text-center"
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault()
              const file = e.dataTransfer.files?.[0]
              await choosePhoto(file)
            }}
            role="button"
            tabIndex={0}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0]
                e.target.value = ''
                await choosePhoto(file)
              }}
            />
            <div className="text-sm font-medium text-neutral-600">
              Drag &amp; drop your photo here or <span className="text-blue-700 underline">browse</span>
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p> : null}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="First name" required value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
            <TextField label="Middle name" value={form.middleName} onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
            <TextField label="Last name" required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Student Email address"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              disabled={disableIdentity}
              helper={disableIdentity ? 'Email cannot be changed' : ''}
            />
            <TextField
              label="Student Contact Number"
              required
              value={form.studentContactNumber}
              onChange={(e) => setForm((p) => ({ ...p, studentContactNumber: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Student Address" required value={form.studentAddress} onChange={(e) => setForm((p) => ({ ...p, studentAddress: e.target.value }))} />
            <TextField
              label="Date of Birth"
              required
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Parent's Contact Number"
              required
              value={form.parentContactNumber}
              onChange={(e) => setForm((p) => ({ ...p, parentContactNumber: e.target.value }))}
            />
            <TextField
              label="Parent's Email"
              required
              type="email"
              value={form.parentEmail}
              onChange={(e) => setForm((p) => ({ ...p, parentEmail: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Student Enrollment No"
              required
              value={form.enrollmentNo}
              onChange={(e) => setForm((p) => ({ ...p, enrollmentNo: e.target.value }))}
              disabled={disableIdentity}
              helper={disableIdentity ? 'Enrollment number cannot be changed' : ''}
            />
            <TextField label="Student Roll No" required value={form.rollNo} onChange={(e) => setForm((p) => ({ ...p, rollNo: e.target.value }))} />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <SelectField
              label="Student Grade Level"
              required
              value={form.grade}
              onChange={(e) => setForm((p) => ({ ...p, grade: e.target.value, sectionId: '' }))}
            >
              <option value="">Select Grade</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectField>

            <TextField
              label="Student Semester"
              required
              value={form.semester}
              onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
              placeholder="e.g. 1"
            />

            <SelectField
              label="Student Section"
              required
              value={form.sectionId}
              onChange={(e) => setForm((p) => ({ ...p, sectionId: e.target.value }))}
              disabled={!form.grade}
            >
              <option value="">Select Section</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} — {s.grade}
                </option>
              ))}
            </SelectField>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-semibold text-neutral-900">Student Login ID</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm disabled:bg-neutral-100"
                  value={loginId}
                  disabled
                  readOnly
                />
                <button type="button" className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white" disabled>
                  Copy
                </button>
              </div>
              <div className="mt-1 text-xs text-neutral-500">Auto-generated from enrollment number</div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-semibold text-neutral-900">Student Password</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="password"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  value={form.password ? '••••••••' : ''}
                  readOnly
                  placeholder="Set password"
                />
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    setPendingPassword(form.password || '')
                    setPasswordModalOpen(true)
                  }}
                >
                  Change
                </button>
              </div>
            </div>
          </div>

          {sectionForId ? null : null}

          <div className="flex justify-start">
            <button type="submit" className="rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110">
              {savingLabel}
            </button>
          </div>
        </form>
      </section>

      {passwordModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Change Password</h3>
            <p className="mt-2 text-sm text-neutral-700">Set a new password for this student.</p>
            <label className="mt-4 block text-sm font-medium text-neutral-700">
              New Password
              <input
                type="text"
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                value={pendingPassword}
                onChange={(e) => setPendingPassword(e.target.value)}
                autoFocus
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => {
                  setPasswordModalOpen(false)
                  setPendingPassword('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={() => {
                  setForm((p) => ({ ...p, password: String(pendingPassword || '').trim() }))
                  setPasswordModalOpen(false)
                  setPendingPassword('')
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default function StudentsPage({
  sections,
  students,
  onAddStudent,
  onUpdateStudent,
  onArchiveStudent,
  onImmediatePurgeStudent,
  onSendPasswordResetEmail,
  onBack,
  initialGrade = '',
  initialSectionId = '',
}) {
  const toast = useNotify()
  const [filterGrade, setFilterGrade] = useState(initialGrade)
  const [filterSectionId, setFilterSectionId] = useState(initialSectionId)
  const [appliedGrade, setAppliedGrade] = useState(initialGrade)
  const [appliedSectionId, setAppliedSectionId] = useState(initialSectionId)
  const [query, setQuery] = useState('')

  const [screen, setScreen] = useState('list') // list | details
  const [detailsMode, setDetailsMode] = useState('add') // add | edit
  const [activeId, setActiveId] = useState('')
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [purgeTarget, setPurgeTarget] = useState(null)
  const [purgeSubmitting, setPurgeSubmitting] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [resetBusyId, setResetBusyId] = useState('')

  const activeStudent = useMemo(() => students.find((s) => s.id === activeId) || null, [students, activeId])

  const gradeOptions = useMemo(() => {
    const set = new Set(sections.map((s) => s.grade))
    return Array.from(set)
  }, [sections])

  const sectionOptions = useMemo(() => {
    const base = appliedGrade ? sections.filter((s) => s.grade === appliedGrade) : sections
    return base
  }, [sections, appliedGrade])

  const filteredStudents = useMemo(() => {
    return students
      .filter((s) => {
        if (appliedGrade && s.grade !== appliedGrade) return false
        if (appliedSectionId && s.sectionId !== appliedSectionId) return false
        return true
      })
      .filter((s) => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        return (
          String(s.name || '').toLowerCase().includes(q) ||
          String(s.enrollmentNo || '').toLowerCase().includes(q) ||
          String(s.phone || '').toLowerCase().includes(q) ||
          String(s.grade || '').toLowerCase().includes(q) ||
          String(s.sectionName || '').toLowerCase().includes(q) ||
          String(s.rollNo || '').toLowerCase().includes(q)
        )
      })
  }, [students, appliedGrade, appliedSectionId, query])

  // keep dropdown list consistent when grade changes before apply
  const sectionOptionsForFilter = useMemo(() => {
    return filterGrade ? sections.filter((s) => s.grade === filterGrade) : sections
  }, [sections, filterGrade])

  useEffect(() => {
    setFilterGrade(initialGrade)
    setFilterSectionId(initialSectionId)
    setAppliedGrade(initialGrade)
    setAppliedSectionId(initialSectionId)
  }, [initialGrade, initialSectionId])

  function openAdd() {
    setActiveId('')
    setDetailsMode('add')
    setScreen('details')
  }

  function openEdit(student) {
    setActiveId(student.id)
    setDetailsMode('edit')
    setScreen('details')
  }

  function applyFilters() {
    setAppliedGrade(filterGrade)
    setAppliedSectionId(filterSectionId)
    setQuery('')
  }

  function clearFilters() {
    setFilterGrade('')
    setFilterSectionId('')
    setAppliedGrade('')
    setAppliedSectionId('')
    setQuery('')
  }

  if (screen === 'details') {
    const initial =
      detailsMode === 'edit' && activeStudent
        ? activeStudent
        : {
            photoDataUrl: '',
            firstName: '',
            middleName: '',
            lastName: '',
            email: '',
            studentContactNumber: '',
            studentAddress: '',
            dateOfBirth: '',
            parentContactNumber: '',
            parentEmail: '',
            enrollmentNo: '',
            rollNo: '',
            grade: initialGrade || '',
            semester: '1',
            sectionId: initialSectionId || '',
            password: '',
          }

    return (
      <StudentDetails
        mode={detailsMode}
        sections={sections}
        gradeOptions={gradeOptions}
        initial={initial}
        onBack={() => setScreen('list')}
        savingLabel="Save Changes"
        onSave={async (payload) => {
          try {
            const res =
              detailsMode === 'edit' && activeStudent
                ? await onUpdateStudent(activeStudent.id, payload)
                : await onAddStudent(payload)
            if (res?.error) {
              toast.error(String(res.error || 'Could not save student.'))
              return res
            }
            if (res?.registeredPostgres && res?.enrollmentNo) {
              toast.success(`Student ${res.enrollmentNo} registered successfully.`, {
                durationMs: 6500,
              })
            } else if (detailsMode === 'edit' && res?.updatedPostgres) {
              toast.success('Student records updated successfully.', { durationMs: 6500 })
            } else if (detailsMode === 'edit') {
              toast.updated('Student updated successfully.')
            } else {
              toast.created('Student created successfully.')
            }
            return res
          } catch (e) {
            toast.error(String(e?.message || e || 'Could not save student.'))
            return { error: String(e?.message || e || 'Could not save student.') }
          }
        }}
      />
    )
  }

  async function handleSendResetEmail(student) {
    if (!onSendPasswordResetEmail) return
    const email = String(student?.email || '').trim()
    if (!email) {
      toast.error('No email on record for this student.', { title: 'Reset email' })
      return
    }
    setResetBusyId(String(student.id || ''))
    try {
      const result = await onSendPasswordResetEmail(email)
      if (result?.error) {
        toast.error(result.error, { title: 'Reset email' })
        return
      }
      toast.success(`Reset link sent to ${result?.maskedEmail || email}`, { title: 'Reset email' })
    } finally {
      setResetBusyId('')
    }
  }

  if (profileOpen && activeStudent) {
    return (
      <StudentProfile
        student={activeStudent}
        onBack={() => setProfileOpen(false)}
        onSendPasswordResetEmail={onSendPasswordResetEmail}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackButton onClick={onBack} />
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">All Students</h2>
        </div>
        <button
          type="button"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          onClick={openAdd}
        >
          + Add Student
        </button>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-neutral-700">
            Grade Level:
            <select
              className="ml-2 rounded-lg border px-3 py-2 text-sm"
              value={filterGrade}
              onChange={(e) => {
                const g = e.target.value
                setFilterGrade(g)
                setFilterSectionId('')
              }}
            >
              <option value="">All Grade Levels</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <label className="text-sm font-medium text-neutral-700">
            Section:
            <select
              className="ml-2 rounded-lg border px-3 py-2 text-sm"
              value={filterSectionId}
              onChange={(e) => setFilterSectionId(e.target.value)}
              disabled={sectionOptionsForFilter.length === 0}
            >
              <option value="">All Sections</option>
              {sectionOptionsForFilter.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            onClick={applyFilters}
          >
            <FilterIcon className="h-4 w-4" />
            Apply Filters
          </button>

          <button
            type="button"
            className="rounded-lg bg-neutral-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            onClick={clearFilters}
          >
            Clear
          </button>
        </div>

        <div className="mt-4 text-sm font-medium text-neutral-600">
          Filtered Students <span className="ml-2 font-semibold text-neutral-900 tabular-nums">{filteredStudents.length}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-neutral-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search students..."
              className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="text-sm font-medium text-neutral-500">
            {filteredStudents.length} student(s) found
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="max-h-130 overflow-auto">
            <table className="min-w-full table-fixed border-collapse">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-xs font-semibold text-neutral-500">
                  <th className="w-[24%] px-4 py-3 text-left">NAME</th>
                  <th className="w-[12%] px-4 py-3 text-left">ENROLLMENT NO.</th>
                  <th className="w-[11%] px-4 py-3 text-left">PHONE</th>
                  <th className="w-[11%] px-4 py-3 text-left">GRADE LEVEL</th>
                  <th className="w-[12%] px-4 py-3 text-left">SECTION</th>
                  <th className="w-[10%] px-4 py-3 text-left">ROLL NO.</th>
                  <th className="w-[240px] px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                      No students found.
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s) => {
                    const photoSrc = facultyPhotoDisplaySrc(s.photoDataUrl || s.photo_url || '')
                    return (
                    <tr key={s.id} className="text-sm text-neutral-800">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          {photoSrc ? (
                            <img
                              src={photoSrc}
                              alt={String(s.name || 'Student')}
                              className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-neutral-200"
                            />
                          ) : (
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 text-xs font-bold text-neutral-700">
                              {initials(s.name)}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-900">{s.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={s.enrollmentNo} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={s.phone} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={s.grade} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={s.sectionName} />
                      </td>
                      <td className="px-4 py-3 font-semibold text-neutral-700">
                        <TruncatedTableCell value={s.rollNo} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex shrink-0 flex-nowrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className="rounded bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                            onClick={() => setArchiveTarget(s)}
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:brightness-110"
                            onClick={() => openEdit(s)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            onClick={() => {
                              setActiveId(s.id)
                              setProfileOpen(true)
                            }}
                          >
                            View
                          </button>
                          {onSendPasswordResetEmail ? (
                            <button
                              type="button"
                              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                              disabled={resetBusyId === String(s.id)}
                              onClick={() => handleSendResetEmail(s)}
                            >
                              {resetBusyId === String(s.id) ? 'Sending…' : 'Send Reset Email'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                            onClick={() => setPurgeTarget(s)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {purgeTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4">
          <div
            className="w-full max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-2xl"
            role="alertdialog"
            aria-labelledby="purge-student-title"
          >
            <div className="flex items-start gap-4">
              <i className="ti ti-alert-triangle shrink-0 text-3xl text-red-500" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="purge-student-title" className="text-lg font-bold text-neutral-900">
                  Permanently Delete {purgeTarget.name}?
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-700">
                  This will immediately remove {purgeTarget.name} and all associated data. This action
                  cannot be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-300"
                onClick={() => setPurgeTarget(null)}
                disabled={purgeSubmitting}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={purgeSubmitting || !onImmediatePurgeStudent}
                className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={async () => {
                  if (!purgeTarget || !onImmediatePurgeStudent) return
                  setPurgeSubmitting(true)
                  try {
                    const res = await onImmediatePurgeStudent(purgeTarget.id)
                    if (res?.error) {
                      toast.error(String(res.error), { title: 'Permanent purge failed' })
                    } else {
                      const name = String(purgeTarget.name || 'Student').trim()
                      toast.deleted(`Student ${name} account deleted.`, { durationMs: 6000 })
                    }
                  } catch (e) {
                    toast.error(String(e?.message || e), { title: 'Permanent purge failed' })
                  } finally {
                    setPurgeSubmitting(false)
                    setPurgeTarget(null)
                  }
                }}
              >
                {purgeSubmitting ? 'Deleting…' : 'Delete Permanently'}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {archiveTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Archive Student</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Archive <span className="font-semibold">{archiveTarget.name}</span>? They will be removed from active
              rosters and moved to the Archive Vault. You can restore them later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => setArchiveTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={async () => {
                  try {
                    const res = await onArchiveStudent(archiveTarget.id)
                    if (res?.error) {
                      toast.error(String(res.error || 'Could not archive student.'))
                    } else {
                      toast.updated('Student archived successfully.', { title: 'Archived' })
                    }
                  } catch (e) {
                    toast.error(String(e?.message || e || 'Could not archive student.'))
                  }
                  setArchiveTarget(null)
                }}
              >
                Yes, Archive
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

