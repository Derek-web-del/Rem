import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import SubjectDetails from './SubjectDetails.jsx'
import SubjectProfile from './SubjectProfile.jsx'
import { formatSemesterLabel, SEMESTER_LABELS } from './lib/quizQuestionTypes.js'
import SubjectCoverImage from './components/SubjectCoverImage.jsx'

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

export default function SubjectsPage({
  gradeOptions,
  facultyOptions,
  curriculumGuideOptions = [],
  subjects,
  onAddSubject,
  onUpdateSubject,
  onDeleteSubject,
  onBack,
}) {
  const [filterGrade, setFilterGrade] = useState('')
  const [filterSemester, setFilterSemester] = useState('')
  const [appliedGrade, setAppliedGrade] = useState('')
  const [appliedSemester, setAppliedSemester] = useState('')
  const [query, setQuery] = useState('')

  const [screen, setScreen] = useState('list') // list | details | profile
  const [mode, setMode] = useState('add') // add | edit
  const [activeId, setActiveId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const [addPickerOpen, setAddPickerOpen] = useState(false)
  const [addPickerGrade, setAddPickerGrade] = useState('')
  const [addPickerSemester, setAddPickerSemester] = useState('1')

  const activeSubject = useMemo(() => subjects.find((s) => s.id === activeId) || null, [subjects, activeId])

  const filtered = useMemo(() => {
    return subjects
      .filter((s) => (appliedGrade ? s.grade === appliedGrade : true))
      .filter((s) => (appliedSemester ? String(s.semester) === String(appliedSemester) : true))
      .filter((s) => {
        const q = query.trim().toLowerCase()
        if (!q) return true
        return (
          String(s.subjectName || '').toLowerCase().includes(q) ||
          String(s.subjectCode || '').toLowerCase().includes(q) ||
          String(s.grade || '').toLowerCase().includes(q)
        )
      })
  }, [subjects, appliedGrade, appliedSemester, query])

  function openAdd() {
    setAddPickerGrade(appliedGrade || '')
    setAddPickerSemester(appliedSemester || '1')
    setAddPickerOpen(true)
  }

  function beginAdd() {
    setMode('add')
    setActiveId('')
    setScreen('details')
    setAddPickerOpen(false)
  }

  function openEdit(s) {
    setMode('edit')
    setActiveId(s.id)
    setScreen('details')
  }

  function openView(s) {
    setActiveId(s.id)
    setScreen('profile')
  }

  if (screen === 'details') {
    const initial =
      mode === 'edit' && activeSubject
        ? activeSubject
        : {
            subjectCode: '',
            subjectName: '',
            grade: addPickerGrade || '',
            semester: Number(addPickerSemester || 1),
            semCode: '',
            assignedFacultyId: '',
            syllabusFileName: '',
            syllabusFileType: '',
            syllabusDataUrl: '',
            curriculumGuideId: '',
            scheduleDayOfWeek: '1',
            scheduleStartTime: '08:00',
            scheduleEndTime: '09:00',
            scheduleRoom: '',
          }

    return (
      <SubjectDetails
        mode={mode}
        gradeOptions={gradeOptions}
        facultyOptions={facultyOptions}
        curriculumGuideOptions={curriculumGuideOptions}
        initial={initial}
        disableIdentity={mode === 'edit'}
        onBack={() => setScreen('list')}
        savingLabel={mode === 'edit' ? 'Save Changes' : 'Save Changes'}
        onSave={async (payload) => {
          if (mode === 'edit' && activeSubject) return onUpdateSubject(activeSubject.id, payload)
          return onAddSubject(payload)
        }}
      />
    )
  }

  if (screen === 'profile') {
    return (
      <SubjectProfile
        subject={activeSubject}
        onBack={() => setScreen('list')}
        onEdit={() => {
          if (!activeSubject) return
          setMode('edit')
          setScreen('details')
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackButton onClick={onBack} />
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Subject List</h2>
        </div>
        <button type="button" className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110" onClick={openAdd}>
          Add Subject
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

          <label className="text-sm font-medium text-neutral-700">
            Semester:
            <select className="ml-2 rounded-lg border px-3 py-2 text-sm" value={filterSemester} onChange={(e) => setFilterSemester(e.target.value)}>
              <option value="">All Semesters</option>
              {[1, 2, 3].map((q) => (
                <option key={q} value={String(q)}>
                  {SEMESTER_LABELS[q]}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            onClick={() => {
              setAppliedGrade(filterGrade)
              setAppliedSemester(filterSemester)
              setQuery('')
            }}
          >
            <FilterIcon className="h-4 w-4" />
            Apply Filters
          </button>
        </div>

        <div className="mt-4 text-sm font-medium text-neutral-600">
          Filtered Subjects <span className="ml-2 font-semibold text-neutral-900 tabular-nums">{filtered.length}</span>
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
          <div className="text-sm font-medium text-neutral-500">{filtered.length} subject(s) found</div>
        </div>

        <div className="mt-4 overflow-hidden rounded-xl border border-neutral-200 bg-white">
          <div className="max-h-[520px] overflow-auto">
            <table className="min-w-full border-collapse">
              <thead className="sticky top-0 bg-neutral-50">
                <tr className="text-xs font-semibold text-neutral-500">
                  <th className="px-4 py-3 text-left">IMAGE</th>
                  <th className="px-4 py-3 text-left">SUBJECT NAME</th>
                  <th className="px-4 py-3 text-left">SUBJECT CODE</th>
                  <th className="px-4 py-3 text-left">GRADE LEVEL</th>
                  <th className="px-4 py-3 text-left">SEMESTER</th>
                  <th className="px-4 py-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                      No subjects found.
                    </td>
                  </tr>
                ) : (
                  filtered.map((s) => (
                    <tr key={s.id} className="text-sm text-neutral-800">
                      <td className="px-4 py-3">
                        <SubjectCoverImage
                          subject={s}
                          alt={s.subjectName || 'Subject'}
                          className="size-10 rounded-lg border border-neutral-200 object-cover"
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-neutral-700">{s.subjectName}</td>
                      <td className="px-4 py-3 font-medium text-neutral-700">{s.subjectCode}</td>
                      <td className="px-4 py-3 font-medium text-neutral-700">{s.grade}</td>
                      <td className="px-4 py-3 font-medium text-neutral-700">{formatSemesterLabel(s.semester) || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-2">
                          <button type="button" className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:brightness-110" onClick={() => openEdit(s)}>
                            Edit
                          </button>
                          <button type="button" className="rounded bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110" onClick={() => setDeleteTarget(s)}>
                            Delete
                          </button>
                          <button type="button" className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110" onClick={() => openView(s)}>
                            View
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

      {addPickerOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-neutral-900">Select Grade Level and Semester</h3>
              </div>
              <button type="button" className="rounded bg-neutral-200 px-3 py-1.5 text-sm font-semibold text-neutral-700 hover:bg-neutral-300" onClick={() => setAddPickerOpen(false)}>
                ✕
              </button>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <label className="text-sm font-medium text-neutral-700">
                Grade Level:
                <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={addPickerGrade} onChange={(e) => setAddPickerGrade(e.target.value)}>
                  <option value="">Select Grade</option>
                  {gradeOptions.map((g) => (
                    <option key={g} value={g}>
                      {g}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-neutral-700">
                Semester:
                <select className="mt-1 w-full rounded-lg border px-3 py-2 text-sm" value={addPickerSemester} onChange={(e) => setAddPickerSemester(e.target.value)}>
                  {[1, 2, 3].map((q) => (
                    <option key={q} value={String(q)}>
                      {SEMESTER_LABELS[q]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button type="button" className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700" onClick={() => setAddPickerOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
                onClick={beginAdd}
                disabled={!addPickerGrade}
              >
                Add Subject
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete Subject</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Are you sure to delete <span className="font-semibold">{deleteTarget.subjectName}</span>? This action cannot be undone.
            </p>
            {deleteError ? <p className="mt-2 text-sm font-medium text-red-700">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                className="rounded bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={async () => {
                  setDeleting(true)
                  setDeleteError('')
                  try {
                    const res = await Promise.resolve(onDeleteSubject(deleteTarget.id))
                    if (res?.error) {
                      setDeleteError(res.error)
                      return
                    }
                    setDeleteTarget(null)
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? 'Deleting…' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

