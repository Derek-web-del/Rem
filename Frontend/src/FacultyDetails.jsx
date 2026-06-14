import { useEffect, useMemo, useRef, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { useNotify } from './components/notifications.jsx'
import { STRONG_PASSWORD_REGEX, passwordPolicyHint } from './lib/auth-client.js'
import { apiUrl } from './lib/lmsStateStorage.js'
import { facultyPhotoDisplaySrc, validateFacultyPhotoFile } from './lib/facultyPhoto.js'
import { PHOTO_UPLOAD_LABEL } from './lib/uploadLimits.js'

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
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
  for (let i = arr.length - 1; i > 0; i--) {
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
  for (let attempt = 0; attempt < 50; attempt++) {
    let pwd = pick(lower) + pick(upper) + pick(digits) + pick(symbols)
    const all = lower + upper + digits + symbols
    while (pwd.length < 12) pwd += pick(all)
    pwd = shuffleString(pwd)
    if (STRONG_PASSWORD_REGEX.test(pwd)) return pwd
  }
  return 'Aa1!aaaa'
}

function passwordChecks(pw) {
  return {
    len: pw.length >= 8,
    upper: /[A-Z]/.test(pw),
    lower: /[a-z]/.test(pw),
    num: /[0-9]/.test(pw),
    special: /[^A-Za-z0-9]/.test(pw),
  }
}

const GRADE_ORDER = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

/** Canonical PostgreSQL `public.faculties` fields (with legacy fallbacks). */
function facultyPhotoFromRecord(record) {
  return String(record?.photo_url ?? record?.photoDataUrl ?? '').trim()
}

function facultyGradeFromRecord(record) {
  return String(record?.grade_level ?? record?.grade ?? '').trim()
}

function sectionGradeFromRecord(section) {
  return String(section?.grade_level ?? section?.grade ?? '').trim()
}

/** Stable key for matching sections across dashboard UUIDs and Postgres numeric ids. */
function sectionKey(s) {
  const pg = s?.postgresSectionId
  if (pg != null && Number.isFinite(Number(pg)) && Number(pg) > 0) return `pg:${Number(pg)}`
  return `id:${String(s?.id ?? '')}`
}

function normalizeSectionRef(raw) {
  const id = String(raw?.id ?? '').trim()
  const pgRaw = raw?.postgresSectionId ?? (/^\d+$/.test(id) ? Number(id) : null)
  const postgresSectionId =
    pgRaw != null && Number.isFinite(Number(pgRaw)) && Number(pgRaw) > 0 ? Number(pgRaw) : undefined
  return {
    id: postgresSectionId != null ? String(postgresSectionId) : id,
    postgresSectionId,
    name: String(raw?.name || '').trim(),
    grade_level: sectionGradeFromRecord(raw),
    grade: sectionGradeFromRecord(raw),
  }
}

function sectionsFromInitial(initial) {
  const list = Array.isArray(initial?.advisorySections) ? initial.advisorySections : []
  return list.map((s) => normalizeSectionRef(s)).filter((s) => s.id || s.postgresSectionId)
}

function isSectionSelected(selectedSections, section) {
  const key = sectionKey(section)
  return selectedSections.some((s) => sectionKey(s) === key)
}

/** Postgres section ids for API POST/PUT. */
function extractSectionIds(selectedSections) {
  return [
    ...new Set(
      selectedSections
        .map((s) => {
          if (s.postgresSectionId != null && Number.isFinite(Number(s.postgresSectionId))) {
            return Number(s.postgresSectionId)
          }
          const n = Number(s.id)
          return Number.isFinite(n) && n > 0 ? n : null
        })
        .filter((n) => n != null && n > 0),
    ),
  ]
}

/** Single directory grade: lowest grade level among selected advisory sections. */
function deriveDirectoryGrade(selectedSections) {
  const grades = (selectedSections || []).map((s) => sectionGradeFromRecord(s)).filter(Boolean)
  const unique = [...new Set(grades)]
  if (unique.length === 0) return ''
  unique.sort((a, b) => {
    const ia = GRADE_ORDER.indexOf(a)
    const ib = GRADE_ORDER.indexOf(b)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  return unique[0]
}

function groupSectionsByGrade(selectedSections) {
  const groups = new Map()
  for (const s of selectedSections || []) {
    const g = sectionGradeFromRecord(s) || 'Other'
    if (!groups.has(g)) groups.set(g, [])
    groups.get(g).push(s)
  }
  const ordered = GRADE_ORDER.filter((g) => groups.has(g)).map((grade) => ({
    grade,
    sections: groups.get(grade),
  }))
  for (const [grade, sections] of groups) {
    if (!GRADE_ORDER.includes(grade)) ordered.push({ grade, sections })
  }
  return ordered
}

export default function FacultyDetails({
  mode,
  sections,
  gradeOptions,
  initial,
  onBack,
  onSave,
  submitLabel = 'Add Faculty',
}) {
  const toast = useNotify()
  const fileInputRef = useRef(null)
  const photoPreviewUrlRef = useRef('')
  /** Edit-mode baseline so unchanged password is omitted from the save payload. */
  const initialSecretsRef = useRef({ pw: '' })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  /** Which grade's sections appear in the picker (changing this does not clear selections). */
  const [sectionBrowseGrade, setSectionBrowseGrade] = useState(() => facultyGradeFromRecord(initial))
  const [browseSections, setBrowseSections] = useState([])
  const [browseSectionsLoading, setBrowseSectionsLoading] = useState(false)
  /** Global advisory picks across all grades (unchanged when browse grade changes). */
  const [selectedSections, setSelectedSections] = useState(() => sectionsFromInitial(initial))
  const [photoUrl, setPhotoUrl] = useState(() =>
    facultyPhotoDisplaySrc(facultyPhotoFromRecord(initial)),
  )
  /** New file selected for upload (sent as multipart; not embedded in JSON). */
  const [photoFile, setPhotoFile] = useState(null)
  const [form, setForm] = useState(() => ({
    firstName: initial.firstName || '',
    middleName: initial.middleName || '',
    lastName: initial.lastName || '',
    email: initial.email || '',
    contactNumber: initial.contactNumber || '',
    grade_level: facultyGradeFromRecord(initial),
    qualification: initial.qualification || '',
    semester: String(initial.semester ?? initial.semester ?? '').trim(),
    address: String(initial.address ?? '').trim(),
    facultyUsername: initial.facultyUsername || initial.username || initial.facultyCode || '',
    password: mode === 'edit' ? String(initial.password || '').trim() : initial.password || generateStrongPassword(),
  }))

  useEffect(() => {
    initialSecretsRef.current = {
      pw: mode === 'edit' ? String(initial.password || '').trim() : '',
    }
  setSectionBrowseGrade(facultyGradeFromRecord(initial))
  setSelectedSections(sectionsFromInitial(initial))
  const nextPhoto = facultyPhotoDisplaySrc(facultyPhotoFromRecord(initial))
  if (photoPreviewUrlRef.current?.startsWith('blob:')) {
    URL.revokeObjectURL(photoPreviewUrlRef.current)
    photoPreviewUrlRef.current = ''
  }
  setPhotoFile(null)
  setPhotoUrl(nextPhoto)
  setForm({
    firstName: initial.firstName || '',
    middleName: initial.middleName || '',
    lastName: initial.lastName || '',
    email: initial.email || '',
    contactNumber: initial.contactNumber || '',
    grade_level: facultyGradeFromRecord(initial),
    qualification: initial.qualification || '',
    semester: String(initial.semester ?? initial.semester ?? '').trim(),
    address: String(initial.address ?? '').trim(),
    facultyUsername: initial.facultyUsername || initial.username || initial.facultyCode || '',
    password: mode === 'edit' ? String(initial.password || '').trim() : initial.password || generateStrongPassword(),
  })
  setError('')
  }, [initial, mode])

  function toggleSection(section) {
    const ref = normalizeSectionRef(section)
    setSelectedSections((prev) => {
      const key = sectionKey(ref)
      if (prev.some((s) => sectionKey(s) === key)) {
        return prev.filter((s) => sectionKey(s) !== key)
      }
      return [...prev, ref]
    })
  }

  function removeSection(section) {
    const key = sectionKey(section)
    setSelectedSections((prev) => prev.filter((s) => sectionKey(s) !== key))
  }

  useEffect(() => {
    if (!sectionBrowseGrade) {
      setBrowseSections([])
      return
    }
    let cancelled = false
    ;(async () => {
      setBrowseSectionsLoading(true)
      try {
        const q = encodeURIComponent(sectionBrowseGrade)
        const res = await fetch(apiUrl(`/api/v1/sections?grade_level=${q}`), { credentials: 'include' })
        const data = await res.json().catch(() => ({}))
        let list = []
        if (res.ok && Array.isArray(data.sections)) {
          list = data.sections.map((row) => ({
            id: String(row.id),
            postgresSectionId: Number(row.id),
            name: String(row.section_name || '').trim(),
            grade_level: String(row.grade_level || sectionBrowseGrade).trim(),
            grade: String(row.grade_level || sectionBrowseGrade).trim(),
          }))
        } else {
          list = sections
            .filter((s) => s.grade === sectionBrowseGrade)
            .map((s) => ({
              id: s.id,
              postgresSectionId: s.postgresSectionId,
              name: s.name,
              grade: s.grade,
            }))
        }
        if (!cancelled) setBrowseSections(list)
      } catch {
        if (!cancelled) {
          setBrowseSections(
            sections
              .filter((s) => s.grade === sectionBrowseGrade)
              .map((s) => ({
                id: s.id,
                postgresSectionId: s.postgresSectionId,
                name: s.name,
                grade: s.grade,
              })),
          )
        }
      } finally {
        if (!cancelled) setBrowseSectionsLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [sectionBrowseGrade, sections])

  const selectedByGrade = useMemo(() => groupSectionsByGrade(selectedSections), [selectedSections])

  const pwTrim = String(form.password || '').trim()
  const checks = passwordChecks(pwTrim)
  const showPasswordRules = mode !== 'edit' || Boolean(pwTrim)

  function choosePhoto(file) {
    if (!file) return
    const validationMsg = validateFacultyPhotoFile(file)
    if (validationMsg) {
      setError(validationMsg)
      toast.error(validationMsg, { title: 'Invalid photo' })
      return
    }
    if (photoPreviewUrlRef.current?.startsWith('blob:')) {
      URL.revokeObjectURL(photoPreviewUrlRef.current)
    }
    const preview = URL.createObjectURL(file)
    photoPreviewUrlRef.current = preview
    setPhotoFile(file)
    setPhotoUrl(preview)
    setError('')
  }

  useEffect(() => {
    return () => {
      if (photoPreviewUrlRef.current?.startsWith('blob:')) {
        URL.revokeObjectURL(photoPreviewUrlRef.current)
      }
    }
  }, [])

  function validate() {
    if (!form.firstName.trim() || !form.lastName.trim()) return 'Please enter first and last name.'
    const email = String(form.email || '').trim()
    if (!email || !email.includes('@')) return 'Please enter a valid faculty email.'
    if (!String(form.facultyUsername || '').trim()) return 'Please enter a Faculty Code ID.'
    if (!String(form.contactNumber || '').trim()) return 'Please enter faculty contact number.'
    if (selectedSections.length === 0) return 'Please select at least one advisory section.'
    if (!deriveDirectoryGrade(selectedSections)) return 'Please select at least one advisory section.'
    if (!String(form.qualification || '').trim()) return 'Please enter faculty qualification.'
    const isEdit = mode === 'edit'
    if (!isEdit || pwTrim) {
      if (!STRONG_PASSWORD_REGEX.test(pwTrim)) return passwordPolicyHint()
    }
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      toast.error(msg, { title: 'Check the form' })
      return
    }
    setError('')
    const sectionIds = extractSectionIds(selectedSections)
    const gradeForDirectory =
      deriveDirectoryGrade(selectedSections) ||
      String(form.grade_level || '').trim() ||
      facultyGradeFromRecord(initial)
    const payload = {
      firstName: form.firstName.trim(),
      middleName: String(form.middleName || '').trim(),
      lastName: form.lastName.trim(),
      name: `${form.firstName}${form.middleName ? ` ${form.middleName}` : ''} ${form.lastName}`.trim(),
      email: String(form.email || '').trim().toLowerCase(),
      facultyUsername: String(form.facultyUsername || '').trim(),
      contactNumber: String(form.contactNumber || '').trim(),
      grade_level: gradeForDirectory,
      gradeLevel: gradeForDirectory,
      advisorySections: selectedSections,
      sectionIds,
      qualification: String(form.qualification || '').trim(),
      semester: String(form.semester || '').trim() || null,
      address: String(form.address || '').trim() || null,
      facultyCode: String(form.facultyUsername || '').trim(),
    }
    if (mode === 'edit') {
      if (pwTrim && pwTrim !== initialSecretsRef.current.pw) payload.password = pwTrim
    } else {
      payload.password = pwTrim
    }
    if (photoFile) {
      payload.photoFile = photoFile
      payload.photoChanged = true
    }
    setSubmitting(true)
    let savingToastId = ''
    try {
      savingToastId = toast.info(photoFile ? 'Uploading faculty photo…' : 'Saving faculty…', {
        title: 'Please wait',
        durationMs: 35_000,
      })
      const res = await Promise.resolve(onSave(payload))
      if (!res || res?.error || res?.success === false) {
        const errMsg = String(res?.error || res?.message || 'Could not save faculty.')
        setError(errMsg)
        toast.error(errMsg, { title: 'Could not save faculty' })
        return
      }
      toast.success(
        mode === 'edit' ? 'Faculty record updated.' : 'Faculty record saved to PostgreSQL.',
        { title: mode === 'edit' ? 'Saved' : 'Faculty added', durationMs: 5000 },
      )
      onBack()
    } catch (err) {
      const errMsg = String(err?.message || err || 'Save failed unexpectedly.')
      setError(errMsg)
      toast.error(errMsg, { title: 'Could not save faculty' })
    } finally {
      if (savingToastId) toast.remove(savingToastId)
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">{mode === 'add' ? 'Add New' : 'Edit'}</p>
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Faculty</h2>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 overflow-hidden rounded-full bg-neutral-200">
              {photoUrl ? (
                <img src={photoUrl} alt="Faculty" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold text-neutral-600">
                  {initials(`${form.firstName} ${form.lastName}`)}
                </div>
              )}
            </div>
            <div>
              <div className="text-sm font-semibold text-neutral-900">Faculty Photo</div>
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

        <form onSubmit={submit} className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <TextField label="First name" required value={form.firstName} onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))} />
            <TextField label="Middle name (Optional)" value={form.middleName} onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))} />
            <TextField label="Last name" required value={form.lastName} onChange={(e) => setForm((p) => ({ ...p, lastName: e.target.value }))} />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Faculty Email address"
              required
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              helper="Faculty can use their school GSuite email (@glendaleschool.edu). Verification codes will be sent here."
            />
            <TextField
              label="Faculty Contact Number"
              required
              value={form.contactNumber}
              onChange={(e) => setForm((p) => ({ ...p, contactNumber: e.target.value }))}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Show sections for grade"
              required
              value={sectionBrowseGrade}
              onChange={(e) => setSectionBrowseGrade(e.target.value)}
            >
              <option value="">Select grade to list sections</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </SelectField>

            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-semibold text-neutral-900">Advisory Sections</div>
              <div className="mt-1 text-xs text-neutral-500">
                Select one or more sections per grade; switch grades to add more across Grade 7–10.
              </div>
              <div className="mt-2 grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Available Sections</div>
                  <div className="mt-2 max-h-40 overflow-auto">
                    {!sectionBrowseGrade ? (
                      <p className="text-sm text-neutral-500">Choose a grade in “Show sections for grade” to list sections.</p>
                    ) : browseSectionsLoading ? (
                      <p className="text-sm text-neutral-500">Loading sections…</p>
                    ) : browseSections.length === 0 ? (
                      <p className="text-sm text-neutral-500">No sections found for this grade.</p>
                    ) : (
                      <ul className="space-y-1">
                        {browseSections.map((s) => {
                          const ref = normalizeSectionRef(s)
                          const checked = isSectionSelected(selectedSections, ref)
                          return (
                            <li key={sectionKey(ref)} className="transition-opacity duration-200">
                              <label className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-white">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded border-neutral-300 text-blue-600 focus:ring-blue-200"
                                  checked={checked}
                                  onChange={() => toggleSection(ref)}
                                />
                                <span className={`text-sm font-medium ${checked ? 'text-blue-900' : 'text-neutral-700'}`}>
                                  {ref.name}
                                </span>
                              </label>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-3 transition-all duration-200">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Selected Sections</div>
                    <span className="text-xs font-medium text-neutral-500 tabular-nums">{selectedSections.length} total</span>
                  </div>
                  <div className="mt-2 max-h-48 overflow-auto transition-all duration-200">
                    {selectedSections.length === 0 ? (
                      <p className="text-sm text-neutral-500">No sections selected yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {selectedByGrade.map(({ grade, sections: gradeSections }) => (
                          <div key={grade}>
                            <div className="text-xs font-bold uppercase tracking-wide text-blue-800">{grade}</div>
                            <ul className="mt-1 space-y-1">
                              {gradeSections.map((s) => (
                                <li
                                  key={sectionKey(s)}
                                  className="flex items-center justify-between gap-2 rounded bg-blue-50/80 px-2 py-1 transition-all duration-200"
                                >
                                  <span className="text-sm font-medium text-blue-900">{s.name}</span>
                                  <button
                                    type="button"
                                    className="shrink-0 text-xs font-semibold text-red-600 hover:text-red-800"
                                    onClick={() => removeSection(s)}
                                    title="Remove section"
                                    aria-label={`Remove ${s.name}`}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <SelectField
              label="Semester"
              value={form.semester}
              onChange={(e) => setForm((p) => ({ ...p, semester: e.target.value }))}
            >
              <option value="">Select semester</option>
              <option value="1">1st Semester</option>
              <option value="2">2nd Semester</option>
              <option value="3">3rd Semester</option>
            </SelectField>
            <TextField
              label="Address"
              value={form.address}
              onChange={(e) => setForm((p) => ({ ...p, address: e.target.value }))}
              placeholder="Faculty address"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <TextField
              label="Faculty Qualification"
              required
              value={form.qualification}
              onChange={(e) => setForm((p) => ({ ...p, qualification: e.target.value }))}
            />
            <div className="rounded-xl border border-neutral-200 bg-white p-4">
              <div className="text-sm font-semibold text-neutral-900">Faculty Code ID</div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  className="w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                  value={form.facultyUsername}
                  onChange={(e) => setForm((p) => ({ ...p, facultyUsername: e.target.value }))}
                  placeholder="e.g., faculty.juan"
                  required
                />
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                Unique ID used on the Faculty sign-in page; it becomes the account username and is used for role-based
                access to faculty resources.
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-sm font-semibold text-neutral-900">Faculty Password</div>
                <div className="mt-1 text-xs text-neutral-500">
                  {mode === 'edit'
                    ? pwTrim
                      ? 'Password must contain:'
                      : 'Leave blank to keep current password'
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

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? 'Saving…' : submitLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  )
}

