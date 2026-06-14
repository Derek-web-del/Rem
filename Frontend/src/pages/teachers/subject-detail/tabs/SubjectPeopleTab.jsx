import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSubjectStudents } from '../../../../lib/teacherSubjectCurriculum.js'
import { useFacultyNotify } from '../../../../lib/facultyNotify.js'

export default function SubjectPeopleTab({ subjectId }) {
  const toast = useFacultyNotify()
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = await fetchSubjectStudents(subjectId)
      setStudents(data.students)
    } catch (e) {
      toast.error(String(e?.message || 'Could not load students.'))
      setStudents([])
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(
      (s) =>
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.section_name || '').toLowerCase().includes(q),
    )
  }, [students, search])

  if (loading) {
    return <p className="px-4 py-8 text-sm text-neutral-500">Loading students…</p>
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-200 px-4 py-3">
        <input
          type="search"
          className="w-full max-w-xs rounded-md border border-neutral-300 px-3 py-1.5 text-sm"
          placeholder="Search by name or section…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="text-xs text-neutral-500">
          {filtered.length} of {students.length} student{students.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-4 py-2.5 font-semibold">Name</th>
              <th className="px-4 py-2.5 font-semibold">Section</th>
              <th className="px-4 py-2.5 font-semibold">Enrollment Status</th>
              <th className="px-4 py-2.5 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-neutral-500">
                  No students found.
                </td>
              </tr>
            ) : null}
            {filtered.map((s) => (
              <tr key={s.id} className="border-b border-neutral-100 hover:bg-neutral-50">
                <td className="px-4 py-2.5 font-medium text-neutral-900">{s.name}</td>
                <td className="px-4 py-2.5 text-neutral-600">{s.section_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      s.enrollment_status === 'active'
                        ? 'bg-green-50 text-green-800'
                        : 'bg-neutral-100 text-neutral-600'
                    }`}
                  >
                    {s.enrollment_status === 'active' ? 'Active' : 'Archived'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {s.section_id ? (
                    <Link
                      to={`/teacher/sections/${s.section_id}/students/${s.id}`}
                      className="text-xs font-medium text-[#185FA5] hover:underline"
                    >
                      View profile
                    </Link>
                  ) : (
                    <span className="text-xs text-neutral-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
