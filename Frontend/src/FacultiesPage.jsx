import { useEffect, useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import FacultyDetails from './FacultyDetails.jsx'
import FacultyProfile from './FacultyProfile.jsx'
import { useNotify } from './components/notifications.jsx'
import { facultyPhotoDisplaySrc } from './lib/facultyPhoto.js'
import { dedupeById } from './lib/dedupeById.js'
import { TruncatedTableCell } from './lib/tableCellDisplay.jsx'

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function FilterIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M3 4h18l-7 8v6l-4 2v-8z" />
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

function facultyPhotoSrc(faculty) {
  const url = facultyPhotoDisplaySrc(faculty?.photo_url || faculty?.photoDataUrl || '')
  return url || null
}

function facultyGradeLevels(faculty) {
  const fromSections = [
    ...new Set(
      (faculty?.advisorySections || [])
        .map((s) => String(s?.grade_level ?? s?.grade ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (fromSections.length) return fromSections
  const listed = Array.isArray(faculty?.gradeLevels)
    ? faculty.gradeLevels.map((g) => String(g || '').trim()).filter(Boolean)
    : []
  if (listed.length) return listed
  const single = String(faculty?.grade_level ?? faculty?.grade ?? '').trim()
  return single ? [single] : []
}

function formatFacultyGradeLevels(faculty) {
  const levels = facultyGradeLevels(faculty)
  return levels.length ? levels.join(', ') : '—'
}

function FacultyAvatar({ faculty, className = 'h-9 w-9' }) {
  const [imgFailed, setImgFailed] = useState(false)
  const src = facultyPhotoSrc(faculty)
  const label = initials(faculty?.name)
  if (src && !imgFailed) {
    return (
      <img
        src={src}
        alt=""
        className={`${className} shrink-0 rounded-full object-cover ring-1 ring-neutral-200`}
        onError={() => setImgFailed(true)}
      />
    )
  }
  return (
    <div
      className={`${className} flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-100 to-blue-200 text-xs font-bold text-blue-900 ring-1 ring-blue-200`}
      aria-hidden
    >
      {label}
    </div>
  )
}

export default function FacultiesPage({
  sections,
  gradeOptions,
  faculties,
  onAddFaculty,
  onUpdateFaculty,
  onArchiveFaculty,
  onImmediatePurgeFaculty,
  onSendPasswordResetEmail,
  onBack,
}) {
  const toast = useNotify()
  const [resetBusyId, setResetBusyId] = useState('')
  const [filterGrade, setFilterGrade] = useState('')
  const [appliedGrade, setAppliedGrade] = useState('')
  const [query, setQuery] = useState('')

  const [screen, setScreen] = useState('list') // list | details | profile
  const [mode, setMode] = useState('add') // add | edit
  const [activeId, setActiveId] = useState('')
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiveSubmitting, setArchiveSubmitting] = useState(false)
  const [purgeTarget, setPurgeTarget] = useState(null)
  const [purgeSubmitting, setPurgeSubmitting] = useState(false)

  const activeFaculty = useMemo(() => faculties.find((f) => f.id === activeId) || null, [faculties, activeId])

  const filtered = useMemo(() => {
    return dedupeById(faculties)
      .filter((f) => (appliedGrade ? facultyGradeLevels(f).includes(appliedGrade) : true))
      .filter((f) => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        const advisory = (f.advisorySections || []).map((s) => s.name).join(', ')
        const gradesText = facultyGradeLevels(f).join(', ')
        return (
          String(f.name || '').toLowerCase().includes(q) ||
          String(f.email || '').toLowerCase().includes(q) ||
          String(f.contactNumber || '').toLowerCase().includes(q) ||
          gradesText.toLowerCase().includes(q) ||
          String(f.facultyUsername || f.facultyCode || '').toLowerCase().includes(q) ||
          advisory.toLowerCase().includes(q)
        )
      })
  }, [faculties, appliedGrade, query])

  useEffect(() => {
    setQuery('')
  }, [appliedGrade])

  function openAdd() {
    setMode('add')
    setActiveId('')
    setScreen('details')
  }

  function openEdit(f) {
    setMode('edit')
    setActiveId(f.id)
    setScreen('details')
  }

  function openView(f) {
    setActiveId(f.id)
    setScreen('profile')
  }

  async function handleSendResetEmail(faculty) {
    if (!onSendPasswordResetEmail) return
    const email = String(faculty?.email || '').trim()
    if (!email) {
      toast.error('No email on record for this faculty member.', { title: 'Reset email' })
      return
    }
    setResetBusyId(String(faculty.id || ''))
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

  if (screen === 'details') {
    const initial =
      mode === 'edit' && activeFaculty
        ? activeFaculty
        : {
            photo_url: '',
            firstName: '',
            middleName: '',
            lastName: '',
            email: '',
            contactNumber: '',
            grade_level: '',
            advisorySections: [],
            qualification: '',
            facultyUsername: '',
            password: '',
            appPassword: '',
          }

    return (
      <FacultyDetails
        mode={mode}
        sections={sections}
        gradeOptions={gradeOptions}
        initial={initial}
        onBack={() => setScreen('list')}
        submitLabel={mode === 'edit' ? 'Save Changes' : 'Add Faculty'}
        onSave={(payload) => {
          if (mode === 'edit' && activeFaculty) return onUpdateFaculty(activeFaculty.id, payload)
          return onAddFaculty(payload)
        }}
      />
    )
  }

  if (screen === 'profile') {
    return (
      <FacultyProfile
        faculty={activeFaculty}
        onBack={() => setScreen('list')}
        onSendPasswordResetEmail={onSendPasswordResetEmail}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackButton onClick={onBack} />
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Faculty List</h2>
        </div>
        <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110" onClick={openAdd}>
          Add Faculty
        </button>
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium text-neutral-700">
            Grade Level:
            <select className="ml-2 rounded-lg border px-3 py-2 text-sm" value={filterGrade} onChange={(e) => setFilterGrade(e.target.value)}>
              <option value="">All Grade Levels</option>
              {gradeOptions.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            onClick={() => {
              setAppliedGrade(filterGrade)
              setQuery('')
            }}
          >
            <FilterIcon className="h-4 w-4" />
            Apply Filters
          </button>
        </div>

        <div className="mt-4 text-sm font-medium text-neutral-600">
          Filtered Faculty <span className="ml-2 font-semibold text-neutral-900 tabular-nums">{filtered.length}</span>
        </div>

        <div className="mt-4 flex flex-col gap-3 rounded-xl bg-neutral-50 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="text-sm font-medium text-neutral-500">{filtered.length} faculty member(s) found</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-full table-fixed border-collapse">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-xs font-semibold text-neutral-500">
                  <th className="w-[28%] px-4 py-3 text-left">NAME</th>
                  <th className="w-[14%] px-4 py-3 text-left">EMAIL</th>
                  <th className="w-[12%] px-4 py-3 text-left">PHONE</th>
                  <th className="w-[12%] px-4 py-3 text-left">GRADE LEVEL</th>
                  <th className="w-[14%] px-4 py-3 text-left">SECTIONS</th>
                  <th className="w-[240px] px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                      No faculty found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((f) => (
                    <tr key={f.id} className="text-sm text-neutral-800">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <FacultyAvatar faculty={f} />
                          <div className="min-w-0">
                            <div className="font-semibold text-neutral-900">{f.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={f.email} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={f.contactNumber} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell value={formatFacultyGradeLevels(f)} />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">
                        <TruncatedTableCell
                          value={(f.advisorySections || []).map((s) => s.name).join(', ')}
                        />
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <div className="inline-flex shrink-0 flex-nowrap items-center justify-end gap-2">
                          <button
                            type="button"
                            className="rounded bg-slate-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
                            onClick={() => setArchiveTarget(f)}
                          >
                            Archive
                          </button>
                          <button
                            type="button"
                            className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:brightness-110"
                            onClick={() => openEdit(f)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                            onClick={() => openView(f)}
                          >
                            View
                          </button>
                          {onSendPasswordResetEmail ? (
                            <button
                              type="button"
                              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                              disabled={resetBusyId === String(f.id)}
                              onClick={() => handleSendResetEmail(f)}
                            >
                              {resetBusyId === String(f.id) ? 'Sending…' : 'Send Reset Email'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="rounded bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                            onClick={() => setPurgeTarget(f)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
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
            aria-labelledby="purge-faculty-title"
          >
            <div className="flex items-start gap-4">
              <i className="ti ti-alert-triangle shrink-0 text-3xl text-red-500" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="purge-faculty-title" className="text-lg font-bold text-neutral-900">
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
                disabled={purgeSubmitting || !onImmediatePurgeFaculty}
                className="rounded bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                onClick={async () => {
                  if (!purgeTarget || !onImmediatePurgeFaculty) return
                  setPurgeSubmitting(true)
                  try {
                    const result = await onImmediatePurgeFaculty(purgeTarget.id)
                    if (result?.error) {
                      toast.error(result.error, { title: 'Permanent purge failed' })
                    } else {
                      const name = String(purgeTarget.name || 'Faculty').trim()
                      toast.deleted(`Faculty ${name} account deleted.`, { durationMs: 6000 })
                    }
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
            <h3 className="text-lg font-bold text-neutral-900">Archive Faculty</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Archive <span className="font-semibold">{archiveTarget.name}</span>? They will be removed from active
              rosters and moved to the Archive Vault. You can restore them later.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700" onClick={() => setArchiveTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={archiveSubmitting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  if (!archiveTarget) return
                  setArchiveSubmitting(true)
                  try {
                    const result = await onArchiveFaculty(archiveTarget.id)
                    if (result?.error) {
                      toast.error(result.error, { title: 'Could not archive faculty' })
                      return
                    }
                    toast.updated('Faculty archived successfully.', { title: 'Archived' })
                    setArchiveTarget(null)
                  } finally {
                    setArchiveSubmitting(false)
                  }
                }}
              >
                {archiveSubmitting ? 'Archiving…' : 'Yes, Archive'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}


