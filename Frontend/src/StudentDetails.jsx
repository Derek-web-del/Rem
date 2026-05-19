import { useEffect, useMemo, useRef, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { STRONG_PASSWORD_REGEX, passwordPolicyHint } from './lib/auth-client.js'

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

function shuffleString(s) {
  const arr = s.split('')
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr.join('')
}

function generateStrongPassword() {
  const lower = 'abcdefghjkmnpqrstuvwxyz'
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const digits = '23456789'
  const symbols = '!@#$%&*-_=+?'
  const pick = (set) => set[Math.floor((crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32) * set.length)]
  for (let attempt = 0; attempt < 50; attempt += 1) {
    let pwd = pick(lower) + pick(upper) + pick(digits) + pick(symbols)
    const all = lower + upper + digits + symbols
    while (pwd.length < 12) pwd += pick(all)
    pwd = shuffleString(pwd)
    if (STRONG_PASSWORD_REGEX.test(pwd)) return pwd
  }
  return 'Aa1!aaaa'
}

function passwordChecks(pw) {
  const s = String(pw || '')
  return {
    len: s.length >= 8,
    upper: /[A-Z]/.test(s),
    lower: /[a-z]/.test(s),
    num: /[0-9]/.test(s),
    special: /[^A-Za-z0-9]/.test(s),
  }
}

export default function StudentDetails({
  mode,
  sections,
  gradeOptions,
  initial,
  onBack,
  onSave,
  savingLabel = 'Save Changes',
}) {
  const fileInputRef = useRef(null)
  /** Edit-mode baselines so unchanged password / app password are omitted from the save payload. */
  const initialSecretsRef = useRef({ pw: '', appNorm: '' })
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [form, setForm] = useState(() => ({
    photoDataUrl: initial.photoDataUrl || '',
    firstName: initial.firstName || '',
    middleName: initial.middleName || '',
    lastName: initial.lastName || '',
    email: initial.email || '',
    loginId: initial.loginId || initial.username || '',
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
    password: mode === 'edit' ? String(initial.password || '').trim() : initial.password || generateStrongPassword(),
    appPassword: mode === 'edit' ? String(initial.appPassword || '').trim() : String(initial.appPassword || '').trim(),
  }))

  useEffect(() => {
    const normApp = (s) => String(s || '').replace(/\s/g, '').trim()
    initialSecretsRef.current = {
      pw: mode === 'edit' ? String(initial.password || '').trim() : '',
      appNorm: mode === 'edit' ? normApp(initial.appPassword) : '',
    }
    setForm({
      photoDataUrl: initial.photoDataUrl || '',
      firstName: initial.firstName || '',
      middleName: initial.middleName || '',
      lastName: initial.lastName || '',
      email: initial.email || '',
      loginId: initial.loginId || initial.username || '',
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
      password: mode === 'edit' ? String(initial.password || '').trim() : initial.password || generateStrongPassword(),
      appPassword: mode === 'edit' ? String(initial.appPassword || '').trim() : String(initial.appPassword || '').trim(),
    })
    setError('')
  }, [initial, mode])

  const sectionOptions = useMemo(() => {
    return form.grade ? sections.filter((s) => s.grade === form.grade) : sections
  }, [sections, form.grade])

  async function choosePhoto(file) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError('Only PNG/JPG images are allowed.')
      return
    }
    if (file.size > 2 * 1024 * 1024) {
      setError('Image must be less than 2MB.')
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
      ['loginId', 'Student Login ID'],
      ['studentContactNumber', 'Student Contact Number'],
      ['studentAddress', 'Student Address'],
      ['dateOfBirth', 'Date of Birth'],
      ['parentContactNumber', "Parent's Contact Number"],
      ['parentEmail', "Parent's Email"],
      ['enrollmentNo', 'Student Enrollment No'],
      ['rollNo', 'Student Roll No'],
      ['grade', 'Student Grade Level'],
      ['semester', 'Student Quarter'],
      ['sectionId', 'Student Section'],
    ]
    if (mode !== 'edit') {
      required.push(['password', 'Student Password'])
    }
    for (const [key, label] of required) {
      if (!String(form[key] || '').trim()) return `${label} is required.`
    }
    const email = String(form.email || '').trim()
    if (!email.includes('@')) return 'Please enter a valid student email.'
    const loginId = String(form.loginId || '').trim()
    if (loginId.length < 3) return 'Student Login ID must be at least 3 characters.'
    const pEmail = String(form.parentEmail || '').trim()
    if (!pEmail.includes('@')) return 'Please enter a valid parent email.'
    const section = sections.find((s) => s.id === form.sectionId)
    if (!section) return 'Please select a valid section.'
    if (section.grade !== form.grade) return 'Selected section does not match grade level.'
    const pwTrim = String(form.password || '').trim()
    if (mode !== 'edit' || pwTrim) {
      if (!STRONG_PASSWORD_REGEX.test(pwTrim)) return passwordPolicyHint()
    }
    if (mode !== 'edit' && !String(form.appPassword || '').replace(/\s/g, '').trim()) {
      return 'Please enter student app password (Gmail).'
    }
    return ''
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    const section = sections.find((s) => s.id === form.sectionId)
    setIsSaving(true)
    try {
      const appPwNormalized = String(form.appPassword || '').replace(/\s/g, '').trim()
      const pwTrim = String(form.password || '').trim()
      const payload = {
        ...form,
        parentEmail: String(form.parentEmail || '').trim().toLowerCase(),
        email: String(form.email || '').trim().toLowerCase(),
        loginId: String(form.loginId || '').trim(),
        grade: section.grade,
        sectionId: section.id,
        sectionName: section.name,
      }
      if (mode === 'edit') {
        if (pwTrim && pwTrim !== initialSecretsRef.current.pw) payload.password = pwTrim
        else delete payload.password
        if (appPwNormalized && appPwNormalized !== initialSecretsRef.current.appNorm) {
          payload.appPassword = appPwNormalized
        } else {
          delete payload.appPassword
        }
      } else {
        payload.password = pwTrim
        payload.appPassword = appPwNormalized
      }
      const res = await onSave(payload)
      if (res?.error) {
        setError(res.error)
        return
      }
      onBack()
    } finally {
      setIsSaving(false)
    }
  }

  const loginId = String(form.loginId || '').trim()
  const pwTrim = String(form.password || '').trim()
  const checks = passwordChecks(pwTrim)
  const showPasswordRules = mode !== 'edit' || Boolean(pwTrim)

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
              <div className="text-xs text-neutral-500">Only allowed PNG or JPG less than 2MB</div>
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
            <TextField label="Middle name (Optional)" value={form.middleName} onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
            <TextField label="Last name" required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Student Email address"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
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
              label="Student Quarter"
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
                  type="text"
                  autoComplete="off"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  value={loginId}
                  onChange={(e) => setForm((p) => ({ ...p, loginId: e.target.value }))}
                  placeholder="e.g. student.juan"
                />
                <button
                  type="button"
                  className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white"
                  onClick={() => {
                    try {
                      navigator.clipboard?.writeText(loginId || '')
                    } catch {}
                  }}
                  title="Copy"
                >
                  Copy
                </button>
              </div>
              <div className="mt-1 text-xs text-neutral-500">Admin-defined ID the student can use to sign in.</div>
            </div>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-neutral-900">Student Password</div>
                  <div className="mt-1 text-xs text-neutral-500">
                    {mode === 'edit'
                      ? 'Leave blank to keep the current password. Otherwise, password must contain:'
                      : 'Password must contain:'}
                  </div>
                </div>
                <button
                  type="button"
                  className="rounded bg-neutral-200 px-3 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-300"
                  onClick={() => setForm((p) => ({ ...p, password: generateStrongPassword() }))}
                  title="Generate"
                >
                  Generate
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  value={form.password}
                  onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                  required={mode !== 'edit'}
                  placeholder={mode === 'edit' ? 'Unchanged' : ''}
                />
              </div>

              {showPasswordRules ? (
                <ul className="mt-3 space-y-1 text-xs font-medium text-neutral-600">
                  <li className={checks.len ? 'text-green-700' : ''}>✓ At least 8 characters</li>
                  <li className={checks.upper ? 'text-green-700' : ''}>✓ At least one uppercase letter</li>
                  <li className={checks.lower ? 'text-green-700' : ''}>✓ At least one lowercase letter</li>
                  <li className={checks.num ? 'text-green-700' : ''}>✓ At least one number</li>
                  <li className={checks.special ? 'text-green-700' : ''}>✓ At least one special character</li>
                </ul>
              ) : null}
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Student App Password (Gmail)</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {mode === 'edit'
                    ? 'Optional when editing: leave blank to keep the stored app password. Enter a new value only if you are rotating it.'
                    : 'Required. Store the Gmail App Password for email integration/OTP. This is not the login password.'}
                </div>
              </div>
            </div>
            <div className="mt-2">
              <input
                type="text"
                className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                value={form.appPassword}
                onChange={(e) => setForm((p) => ({ ...p, appPassword: e.target.value }))}
                placeholder={mode === 'edit' ? 'Leave blank to keep current' : '16-character Gmail App Password'}
                required={mode !== 'edit'}
              />
            </div>
          </div>

          <div className="flex justify-start">
            <button
              type="submit"
              disabled={isSaving}
              className="rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {isSaving ? 'Saving…' : savingLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

