import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useNotify } from '../components/notifications.jsx'
import { STRONG_PASSWORD_REGEX, passwordPolicyHint } from '../lib/auth-client.js'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { dispatchAuditLogsRefresh } from '../lib/auditLogRefresh.js'
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_MSG, PHOTO_UPLOAD_LABEL } from '../lib/uploadLimits.js'

const MAX_PHOTO_BYTES = PROFILE_PHOTO_MAX_BYTES
const PHOTO_ACCEPT = 'image/png,image/jpeg,image/jpg'

function shuffleString(s) {
  const arr = s.split('')
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

/** Meets {@link STRONG_PASSWORD_REGEX}: 8+ chars, upper, lower, digit, symbol. */
function generateStrongPassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&*-_=+?'
  const pick = (set) => set[Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * set.length)]
  for (let attempt = 0; attempt < 50; attempt++) {
    let pwd = pick(lower) + pick(upper) + pick(digits) + pick(symbols)
    const all = lower + upper + digits + symbols
    while (pwd.length < 12) {
      pwd += pick(all)
    }
    pwd = shuffleString(pwd)
    if (STRONG_PASSWORD_REGEX.test(pwd)) return pwd
  }
  return 'Aa1!aaaa'
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function mapRowToForm(row) {
  if (!row || typeof row !== 'object') return null
  const dob = row.dob != null ? String(row.dob).slice(0, 10) : ''
  return {
    studentPhotoUrl: row.photo_url || row.student_photo_url || '',
    firstName: row.first_name || '',
    middleName: row.middle_name || '',
    lastName: row.last_name || '',
    email: row.email || '',
    contactNumber: row.contact_no || row.contact_number || '',
    address: row.address || '',
    dob,
    parentContact: row.parent_contact || '',
    parentEmail: row.parent_email || '',
    enrollmentNo: row.enrollment_no || '',
    rollNo: row.roll_no || '',
    gradeLevel: row.grade_level || '',
    semester: row.semester || '',
    sectionId: row.section_id != null && row.section_id !== '' ? String(row.section_id) : '',
    loginId: row.login_id || '',
    password: '',
    appPasswordGmail: row.app_password_gmail || '',
  }
}

function emptyForm() {
  return {
    studentPhotoUrl: '',
    firstName: '',
    middleName: '',
    lastName: '',
    email: '',
    contactNumber: '',
    address: '',
    dob: '',
    parentContact: '',
    parentEmail: '',
    enrollmentNo: '',
    rollNo: '',
    gradeLevel: '',
    semester: '',
    sectionId: '',
    loginId: '',
    password: '',
    appPasswordGmail: '',
  }
}

function TextField({ label, required, type = 'text', value, onChange, disabled, placeholder, helper }) {
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

function SelectField({ label, required, value, onChange, disabled, children }) {
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

function buildPayload(form, { includePassword }) {
  const sectionIdRaw = String(form.sectionId || '').trim()
  const sectionId = sectionIdRaw ? Number(sectionIdRaw) : null
  const payload = {
    studentPhotoUrl: String(form.studentPhotoUrl || '').trim() || null,
    firstName: String(form.firstName || '').trim(),
    middleName: String(form.middleName || '').trim() || null,
    lastName: String(form.lastName || '').trim(),
    email: String(form.email || '').trim(),
    contactNumber: String(form.contactNumber || '').trim(),
    address: String(form.address || '').trim(),
    dob: String(form.dob || '').trim(),
    parentContact: String(form.parentContact || '').trim(),
    parentEmail: String(form.parentEmail || '').trim(),
    enrollmentNo: String(form.enrollmentNo || '').trim(),
    rollNo: String(form.rollNo || '').trim(),
    gradeLevel: String(form.gradeLevel || '').trim(),
    semester: String(form.semester || '').trim(),
    sectionId: sectionId != null && Number.isFinite(sectionId) && sectionId > 0 ? sectionId : null,
    loginId: String(form.loginId || '').trim(),
    appPasswordGmail: String(form.appPasswordGmail || '').trim() || null,
  }
  if (includePassword) payload.password = String(form.password || '').trim()
  return payload
}

/**
 * Institute student form backed by PostgreSQL (`students` + `sections`).
 * Open from the router, optionally with `?id=<numeric>` to edit an existing row.
 */
export default function StudentDetails() {
  const toast = useNotify()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const editId = useMemo(() => {
    const raw = String(searchParams.get('id') || '').trim()
    const n = Number(raw)
    return Number.isFinite(n) && n > 0 ? n : null
  }, [searchParams])

  const fileRef = useRef(null)
  const [sections, setSections] = useState([])
  const [sectionsError, setSectionsError] = useState('')
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingStudent, setLoadingStudent] = useState(!!editId)
  const [form, setForm] = useState(emptyForm)
  const [photoError, setPhotoError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')

  const displayName = useMemo(() => {
    const parts = [form.firstName, form.middleName, form.lastName].map((s) => String(s || '').trim()).filter(Boolean)
    return parts.join(' ') || 'Student'
  }, [form.firstName, form.middleName, form.lastName])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSections(true)
      setSectionsError('')
      try {
        const res = await fetch(apiUrl('/api/v1/sections'), { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(data?.message || data?.error || `Sections request failed (${res.status}).`))
        }
        const list = Array.isArray(data?.sections) ? data.sections : []
        if (!cancelled) setSections(list)
      } catch (e) {
        if (!cancelled) {
          setSections([])
          setSectionsError(String(e?.message || e || 'Could not load sections.'))
        }
      } finally {
        if (!cancelled) setLoadingSections(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!editId) {
      setLoadingStudent(false)
      setForm(emptyForm())
      return
    }
    let cancelled = false
    ;(async () => {
      setLoadingStudent(true)
      setFormError('')
      try {
        const res = await fetch(apiUrl('/api/v1/students'), { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(String(data?.message || data?.error || `Students request failed (${res.status}).`))
        }
        const list = Array.isArray(data?.students) ? data.students : []
        const row = list.find((s) => Number(s.id) === editId)
        const mapped = mapRowToForm(row)
        if (!mapped) {
          throw new Error('Student not found.')
        }
        if (!cancelled) setForm(mapped)
      } catch (e) {
        if (!cancelled) setFormError(String(e?.message || e || 'Could not load student.'))
      } finally {
        if (!cancelled) setLoadingStudent(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [editId])

  const onPhotoPick = useCallback(async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    setPhotoError('')
    if (!file) return
    if (!ACCEPT_TYPES.split(',').map((t) => t.trim()).includes(file.type)) {
      setPhotoError('Please use a PNG or JPG image.')
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoError(PROFILE_PHOTO_MAX_MSG)
      return
    }
    try {
      const dataUrl = await readFileAsDataUrl(file)
      if (!dataUrl.startsWith('data:image/')) {
        setPhotoError('Invalid image data.')
        return
      }
      setForm((p) => ({ ...p, studentPhotoUrl: dataUrl }))
    } catch (err) {
      setPhotoError(String(err?.message || err || 'Could not read image.'))
    }
  }, [])

  const onGeneratePassword = useCallback(() => {
    const pwd = generateStrongPassword()
    setForm((p) => ({ ...p, password: pwd }))
  }, [])

  async function onSubmit(e) {
    e.preventDefault()
    setFormError('')
    const pwd = String(form.password || '').trim()
    if (!editId && !pwd) {
      setFormError('Password is required for new students.')
      return
    }
    if (pwd && !STRONG_PASSWORD_REGEX.test(pwd)) {
      setFormError(passwordPolicyHint())
      return
    }
    const includePassword = !editId || !!pwd
    const payload = buildPayload(form, { includePassword })
    if (!payload.sectionId) {
      setFormError('Student section is required.')
      return
    }
    setSubmitting(true)
    try {
      const url = editId
        ? apiUrl(`/api/v1/students/${encodeURIComponent(String(editId))}`)
        : apiUrl('/api/v1/students')
      const res = await fetch(url, {
        method: editId ? 'PUT' : 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(String(data?.message || data?.error || `Save failed (${res.status}).`))
      }
      toast.success(`Student ${String(form.enrollmentNo || '').trim() || displayName} successfully registered in PostgreSQL`, {
        durationMs: 6500,
      })
      if (editId) {
        dispatchAuditLogsRefresh({ type: 'student', id: editId })
      }
      if (!editId && data?.student?.id != null) {
        navigate(`/institute/student-details?id=${encodeURIComponent(String(data.student.id))}`, { replace: true })
      }
    } catch (err) {
      setFormError(String(err?.message || err || 'Save failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (loadingSections || loadingStudent) {
    return (
      <div className="flex min-h-svh items-center justify-center bg-neutral-50 px-4 text-sm font-medium text-neutral-600">
        Loading student form…
      </div>
    )
  }

  return (
    <div className="min-h-svh bg-neutral-50 px-4 py-8 text-neutral-900 md:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to="/" className="text-xs font-semibold uppercase tracking-wider text-neutral-500 hover:text-neutral-700">
              « Home
            </Link>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">{editId ? 'Edit student' : 'New student'}</h1>
            <p className="mt-1 text-sm text-neutral-600">Data is stored in PostgreSQL (`students`).</p>
          </div>
        </div>

        {sectionsError ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{sectionsError}</div>
        ) : null}
        {formError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{formError}</div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm md:p-8">
          <section>
            <h2 className="text-lg font-semibold text-neutral-900">Photo</h2>
            <p className="mt-1 text-xs text-neutral-500">{PHOTO_UPLOAD_LABEL}. Stored as Base64 in `photo_url`.</p>
            <div className="mt-3 flex flex-wrap items-center gap-4">
              {form.studentPhotoUrl ? (
                <img
                  src={form.studentPhotoUrl}
                  alt="Student"
                  className="h-24 w-24 rounded-lg border border-neutral-200 object-cover"
                />
              ) : (
                <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-500">
                  No photo
                </div>
              )}
              <div>
                <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} className="hidden" onChange={onPhotoPick} />
                <button
                  type="button"
                  className="rounded-lg bg-neutral-800 px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
                  onClick={() => fileRef.current?.click()}
                >
                  Upload photo
                </button>
                {photoError ? <p className="mt-2 text-xs text-red-600">{photoError}</p> : null}
              </div>
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="First name" required value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
            <TextField label="Middle name" value={form.middleName} onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
            <TextField label="Last name" required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
            <TextField label="Email" required type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
            <TextField
              label="Contact number"
              required
              value={form.contactNumber}
              onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
            />
            <TextField label="Date of birth" required type="date" value={form.dob} onChange={(e) => setForm((p) => ({ ...p, dob: e.target.value }))} />
          </div>

          <TextField label="Address" required value={form.address} onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))} />

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Parent / guardian contact"
              required
              value={form.parentContact}
              onChange={(e) => setForm((p) => ({ ...p, parentContact: e.target.value }))}
            />
            <TextField
              label="Parent / guardian email"
              required
              type="email"
              value={form.parentEmail}
              onChange={(e) => setForm((p) => ({ ...p, parentEmail: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Enrollment number"
              required
              value={form.enrollmentNo}
              onChange={(e) => setForm((p) => ({ ...p, enrollmentNo: e.target.value }))}
            />
            <TextField label="Roll number" required value={form.rollNo} onChange={(e) => setForm((p) => ({ ...p, rollNo: e.target.value }))} />
            <TextField label="Grade level" required value={form.gradeLevel} onChange={(e) => setForm((p) => ({ ...p, gradeLevel: e.target.value }))} />
            <TextField label="Semester" required value={form.semester} onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))} />
          </div>

          <SelectField
            label="Student section"
            required
            value={form.sectionId}
            onChange={(e) => setForm((p) => ({ ...p, sectionId: e.target.value }))}
            disabled={sections.length === 0}
          >
            <option value="">{sections.length === 0 ? 'No sections — create one in the dashboard' : 'Select section'}</option>
            {sections.map((s) => (
              <option key={s.id} value={String(s.id)}>
                {s.section_name} ({s.grade_level})
              </option>
            ))}
          </SelectField>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField label="Login ID" required value={form.loginId} onChange={(e) => setForm((p) => ({ ...p, loginId: e.target.value }))} />
            <div>
              <label className="block text-sm font-medium text-neutral-700">
                Password
                {!editId ? <span className="text-red-600"> *</span> : <span className="text-neutral-500"> (leave blank to keep)</span>}
                <div className="mt-1 flex gap-2">
                  <input
                    type="text"
                    autoComplete="new-password"
                    className="min-w-0 flex-1 rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                    value={form.password}
                    onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                    placeholder={editId ? '••••••••' : ''}
                  />
                  <button
                    type="button"
                    className="shrink-0 rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-2 text-sm font-semibold text-neutral-800 hover:bg-neutral-100"
                    onClick={onGeneratePassword}
                  >
                    Generate
                  </button>
                </div>
              </label>
              <p className="mt-1 text-xs text-neutral-500">{passwordPolicyHint()}</p>
            </div>
          </div>

          <TextField
            label="Gmail app password (optional)"
            value={form.appPasswordGmail}
            onChange={(e) => setForm((p) => ({ ...p, appPasswordGmail: e.target.value }))}
            helper="Stored as plain text in this demo column; rotate if exposed."
          />

          <div className="flex flex-wrap gap-3">
            <button
              type="submit"
              disabled={submitting || sections.length === 0}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? 'Saving…' : editId ? 'Save changes' : 'Save to PostgreSQL'}
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-300 bg-white px-5 py-2.5 text-sm font-semibold text-neutral-800 hover:bg-neutral-50"
              onClick={() => navigate(-1)}
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
