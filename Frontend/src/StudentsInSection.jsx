import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import StudentDetails from './StudentDetails.jsx'
import StudentProfile from './StudentProfile.jsx'
import { useNotify } from './components/notifications.jsx'
import ArchiveReasonModal from './components/ArchiveReasonModal.jsx'

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
}

export default function StudentsInSection({
  section,
  students,
  sections,
  gradeOptions,
  onUpdateStudent,
  onArchiveStudent,
  onBack,
}) {
  const toast = useNotify()
  const name = section?.name || '—'
  const grade = section?.grade || '—'
  const [query, setQuery] = useState('')
  const [screen, setScreen] = useState('list') // list | edit | profile
  const [activeId, setActiveId] = useState('')
  const [profileOpen, setProfileOpen] = useState(false)
  const [archiveTarget, setArchiveTarget] = useState(null)
  const [archiveSubmitting, setArchiveSubmitting] = useState(false)

  const sectionStudents = useMemo(() => {
    const sectionId = section?.id
    if (!sectionId) return []
    return students.filter((s) => s.sectionId === sectionId)
  }, [students, section?.id])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return sectionStudents
    return sectionStudents.filter((s) => {
      return (
        String(s.rollNo || '').toLowerCase().includes(q) ||
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.enrollmentNo || '').toLowerCase().includes(q) ||
        String(s.phone || s.studentContactNumber || '').toLowerCase().includes(q) ||
        String(s.email || '').toLowerCase().includes(q)
      )
    })
  }, [sectionStudents, query])

  const totalStudents = sectionStudents.length
  const activeStudent = useMemo(() => filtered.find((s) => s.id === activeId) || sectionStudents.find((s) => s.id === activeId) || null, [filtered, sectionStudents, activeId])

  if (screen === 'edit' && activeStudent) {
    return (
      <StudentDetails
        mode="edit"
        sections={sections}
        gradeOptions={gradeOptions}
        initial={activeStudent}
        onBack={() => setScreen('list')}
        savingLabel="Save Changes"
        onSave={async (payload) => {
          try {
            const res = await onUpdateStudent(activeStudent.id, payload)
            if (res?.error) {
              toast.error(String(res.error || 'Could not update student.'))
              return res
            }
            if (res?.updatedPostgres) {
              toast.success('Student records updated successfully.', { durationMs: 6500 })
            } else {
              toast.updated('Student updated successfully.')
            }
            return res
          } catch (e) {
            toast.error(String(e?.message || e || 'Could not update student.'))
            return { error: String(e?.message || e || 'Could not update student.') }
          }
        }}
      />
    )
  }

  if (screen === 'profile' && activeStudent) {
    return <StudentProfile student={activeStudent} onBack={() => setScreen('list')} />
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">View</p>
          <h2 className="text-3xl font-bold text-neutral-900">Students in Section</h2>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <div className="rounded-xl bg-linear-to-r from-blue-600 to-indigo-600 p-5 shadow-md md:p-6">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-lg font-semibold text-white">{name}</div>
            <div className="text-sm font-medium text-blue-100">{grade}</div>
          </div>
          <div className="text-right">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-100">Total Students</div>
            <div className="text-2xl font-bold text-white tabular-nums">{totalStudents}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-xl bg-white p-4 shadow-md md:flex-row md:items-center md:justify-between">
        <div className="flex-1">
          <input
            type="text"
            placeholder="Search students..."
            className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="text-sm font-medium text-neutral-500">
          {filtered.length} students in this section
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-white shadow-md">
        <div className="max-h-130 overflow-auto">
          <table className="min-w-full border-collapse">
            <thead className="sticky top-0 bg-neutral-50">
              <tr className="text-xs font-semibold text-neutral-500">
                <th className="px-4 py-3 text-left">ROLL NO.</th>
                <th className="px-4 py-3 text-left">NAME</th>
                <th className="px-4 py-3 text-left">ENROLLMENT NO.</th>
                <th className="px-4 py-3 text-left">PHONE</th>
                <th className="px-4 py-3 text-left">EMAIL</th>
                <th className="px-4 py-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-sm font-medium text-neutral-500">
                    No students to display yet.
                  </td>
                </tr>
              ) : (
                filtered.map((s) => {
                  const photoSrc = String(s.photoDataUrl || s.photo_url || '').trim()
                  return (
                  <tr key={s.id} className="text-sm text-neutral-800">
                    <td className="px-4 py-3 whitespace-nowrap font-semibold text-neutral-700">{s.rollNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
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
                          <div className="truncate font-semibold text-neutral-900">{s.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-neutral-700">{s.enrollmentNo}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-neutral-700">{s.phone || s.studentContactNumber}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-neutral-700">{s.email}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          className="rounded bg-blue-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                          onClick={() => {
                            setActiveId(s.id)
                            setScreen('profile')
                          }}
                        >
                          View
                        </button>
                        <button
                          type="button"
                          className="rounded bg-amber-400 px-3 py-1.5 text-xs font-semibold text-neutral-900 hover:brightness-110"
                          onClick={() => {
                            setActiveId(s.id)
                            setScreen('edit')
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="rounded bg-red-500 px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                          onClick={() => setArchiveTarget(s)}
                        >
                          Archive
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

      {profileOpen ? null : null}

      <ArchiveReasonModal
        open={Boolean(archiveTarget)}
        entityLabel="Student"
        targetName={archiveTarget?.name || ''}
        submitting={archiveSubmitting}
        onClose={() => setArchiveTarget(null)}
        onConfirm={async (reason) => {
          if (!archiveTarget) return
          setArchiveSubmitting(true)
          try {
            const res = await Promise.resolve(onArchiveStudent(archiveTarget.id, reason))
            if (res?.error) {
              toast.error(String(res.error || 'Could not archive student.'))
              return
            }
            toast.updated('Student archived successfully.', { title: 'Archived' })
            setArchiveTarget(null)
          } catch (e) {
            toast.error(String(e?.message || e || 'Could not archive student.'))
          } finally {
            setArchiveSubmitting(false)
          }
        }}
      />
    </div>
  )
}

