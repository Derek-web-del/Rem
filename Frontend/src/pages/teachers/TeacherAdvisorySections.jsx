import { useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { facultyPhotoDisplaySrc } from '../../lib/facultyPhoto.js'

/** Advisory sections from GET /api/teacher/advisory-sections — expandable roster + filter. */
export default function TeacherAdvisorySections({ sections, loading, error }) {
  const list = Array.isArray(sections) ? sections : []
  const [expandedSection, setExpandedSection] = useState(null)
  const [searchQuery, setSearchQuery] = useState({})

  if (loading) {
    return (
      <div className="mt-6 text-center text-[13px] text-neutral-500" role="status">
        Loading advisory sections…
      </div>
    )
  }

  if (error) {
    return (
      <div
        className="mt-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/90 px-4 py-6 text-center text-[13px] text-neutral-600"
        role="status"
      >
        No advisory sections currently assigned.
      </div>
    )
  }

  if (!list.length) {
    return (
      <div
        className="mt-6 rounded-lg border border-dashed border-neutral-200 bg-neutral-50/90 px-4 py-6 text-center text-[13px] text-neutral-600"
        role="status"
      >
        No advisory sections currently assigned.
      </div>
    )
  }

  return (
    <div className="mt-6">
      <h3 className="mb-3 text-[13px] font-medium uppercase tracking-[0.05em] text-neutral-500">
        My Advisory Sections
      </h3>
      <div className="flex flex-col gap-3">
        {list.map((section) => {
          const sid = String(section?.id ?? '')
          const grade = String(section?.grade_level ?? '').trim() || '—'
          const name = String(section?.name ?? '').trim() || '—'
          const total =
            typeof section?.total_students === 'number' && Number.isFinite(section.total_students)
              ? section.total_students
              : Array.isArray(section?.students)
                ? section.students.length
                : 0

          const isOpen = expandedSection === sid
          const q = String(searchQuery[sid] ?? '').trim().toLowerCase()
          const studs = Array.isArray(section?.students) ? section.students : []
          const filteredStudents = studs.filter((student) => {
            if (!q) return true
            const fn = String(student?.first_name ?? '').toLowerCase()
            const ln = String(student?.last_name ?? '').toLowerCase()
            const en = String(student?.enrollment_no ?? '').toLowerCase()
            const stk = String(student?.student_id ?? '').toLowerCase()
            return (
              fn.includes(q) ||
              ln.includes(q) ||
              `${ln}, ${fn}`.includes(q) ||
              `${fn} ${ln}`.includes(q) ||
              en.includes(q) ||
              stk.includes(q)
            )
          })

          return (
            <div
              key={sid || name + grade}
              className="overflow-hidden rounded-lg border border-neutral-200/90 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() => setExpandedSection(isOpen ? null : sid)}
                className="flex w-full cursor-pointer select-none items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-neutral-50/90"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[12px] font-medium text-neutral-500">{grade}</span>
                  <span className="truncate text-[15px] font-medium text-neutral-900">{name}</span>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-[13px] text-neutral-600">
                    {total} {total === 1 ? 'student' : 'students'}
                  </span>
                  <i
                    className={`ti ti-chevron-${isOpen ? 'up' : 'down'}`}
                    style={{ fontSize: '16px' }}
                    aria-hidden
                  />
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-neutral-200/90 px-4 py-3">
                  <input
                    type="search"
                    placeholder="Search student…"
                    value={searchQuery[sid] || ''}
                    onChange={(e) =>
                      setSearchQuery((prev) => ({
                        ...prev,
                        [sid]: e.target.value,
                      }))
                    }
                    className="mb-2 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-[13px] outline-none ring-blue-500/30 focus-visible:ring-2"
                  />
                  <p className="mb-2 text-[12px] text-neutral-500">
                    {total} enrolled student{total === 1 ? '' : 's'}
                  </p>
                  <div className="flex max-h-[300px] flex-col gap-2 overflow-y-auto pr-1">
                    {filteredStudents.map((student, index) => {
                      const pk = student?.id != null ? String(student.id) : `${index}-${name}`
                      const photoSrc = facultyPhotoDisplaySrc(student?.photo_url, { apiUrlFn: apiUrl })
                      const enr =
                        student?.enrollment_no || student?.student_id
                          ? String(student.enrollment_no || student.student_id).trim()
                          : null
                      return (
                        <div
                          key={pk}
                          className="flex items-center gap-2.5 rounded-md bg-neutral-50/90 px-2 py-1.5"
                        >
                          <span className="min-w-[1.25rem] text-[12px] text-neutral-500">{index + 1}</span>
                          {photoSrc ? (
                            <img
                              src={photoSrc}
                              alt=""
                              className="size-7 shrink-0 rounded-full object-cover"
                            />
                          ) : (
                            <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-sky-100 text-[11px] font-semibold text-sky-800">
                              {String(student?.first_name?.[0] || '').toUpperCase()}
                              {String(student?.last_name?.[0] || '').toUpperCase()}
                            </div>
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13px] text-neutral-900">
                            {[student?.last_name, student?.first_name].filter(Boolean).join(', ') || '—'}
                          </span>
                          <span className="shrink-0 text-[12px] text-neutral-500">{enr || '—'}</span>
                        </div>
                      )
                    })}
                  </div>
                  {studs.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-neutral-500">
                      No students enrolled in this section yet.
                    </p>
                  ) : filteredStudents.length === 0 ? (
                    <p className="py-4 text-center text-[13px] text-neutral-500">No matching students.</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
