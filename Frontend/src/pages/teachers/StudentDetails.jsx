import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { facultyPhotoDisplaySrc } from '../../lib/facultyPhoto.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'

const labelStyle = {
  padding: '10px 14px',
  color: 'var(--color-text-secondary, #6b7280)',
  fontSize: '13px',
  borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
  width: '20%',
  whiteSpace: 'nowrap',
}

const valueStyle = {
  padding: '10px 14px',
  color: 'var(--color-text-primary, #111827)',
  fontSize: '13px',
  borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
  width: '30%',
}

function studentFullName(st) {
  if (st?.full_name) return String(st.full_name).trim()
  if (st?.name) return String(st.name).trim()
  return [st?.first_name, st?.middle_name, st?.last_name]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim() || '—'
}

function cell(value) {
  const s = value != null ? String(value).trim() : ''
  return s || '—'
}

export default function TeacherStudentDetails() {
  const { sectionId, studentId } = useParams()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}

  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('basic')

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadStudent = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/teacher/student/${encodeURIComponent(studentId)}`), {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load student.')
      }
      console.log('[STUDENT PROFILE] student data:', data)
      setStudent(data)
    } catch (e) {
      setStudent(null)
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    void loadStudent()
  }, [loadStudent])

  const photo = facultyPhotoDisplaySrc(student?.photo_url, { apiUrlFn: apiUrl })
  const fullName = studentFullName(student)
  const sectionLabel = [student?.grade_level, student?.section_name || student?.section]
    .map((p) => String(p ?? '').trim())
    .filter(Boolean)
    .join('-') || '—'

  return (
    <>
      <TeacherMainHeader pageTitle="Sections" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <TeacherBackButton
          to={
            sectionId
              ? `/teacher/sections/${encodeURIComponent(sectionId)}/students`
              : '/teacher/sections'
          }
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Students Profile</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">Loading student profile…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : !student ? (
          <p className="text-sm text-neutral-600">Student not found.</p>
        ) : (
          <>
            <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
              <div className="flex flex-wrap items-center gap-5">
                {photo ? (
                  <img src={photo} alt="" className="size-20 rounded-xl object-cover ring-2 ring-neutral-100" />
                ) : (
                  <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
                    {String(student.first_name?.[0] || '').toUpperCase()}
                    {String(student.last_name?.[0] || '').toUpperCase()}
                  </div>
                )}
                <div>
                  <h3 className="text-2xl font-bold text-neutral-900">{fullName}</h3>
                  <p className="mt-1 text-sm text-neutral-600">
                    Enrollment: {cell(student.enrollment_no)}
                  </p>
                  <p className="mt-1 text-sm font-medium text-neutral-700">
                    QUARTER: {cell(student.quarter)}
                  </p>
                  <p className="text-sm font-medium text-neutral-700">SECTION: {sectionLabel}</p>
                </div>
              </div>
            </section>

            <div className="flex gap-2 border-b border-neutral-200">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                  activeTab === 'basic'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Basic Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('analytics')}
                className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                  activeTab === 'analytics'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Analytics
              </button>
            </div>

            {activeTab === 'basic' ? (
              <div
                style={{
                  background: 'var(--color-background-primary, #ffffff)',
                  border: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
                  borderRadius: 'var(--border-radius-lg, 12px)',
                  padding: '1.5rem',
                }}
              >
                <h3
                  style={{
                    fontWeight: '600',
                    marginBottom: '1rem',
                    fontSize: '16px',
                    color: 'var(--color-text-primary, #111827)',
                  }}
                >
                  Student Info:
                </h3>
                <table
                  style={{
                    width: '100%',
                    borderCollapse: 'collapse',
                    fontSize: '14px',
                  }}
                >
                  <tbody>
                    <tr>
                      <td style={labelStyle}>Student Name</td>
                      <td style={valueStyle} colSpan={3}>
                        {fullName}
                      </td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Enrollment No.</td>
                      <td style={valueStyle}>{cell(student.enrollment_no)}</td>
                      <td style={labelStyle}>Grade Level</td>
                      <td style={valueStyle}>{cell(student.grade_level)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Quarter</td>
                      <td style={valueStyle}>{cell(student.quarter)}</td>
                      <td style={labelStyle}>Section</td>
                      <td style={valueStyle}>{cell(student.section_name || student.section)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Roll No.</td>
                      <td style={valueStyle}>{cell(student.roll_no)}</td>
                      <td style={labelStyle}>E-mail</td>
                      <td style={valueStyle}>{cell(student.email)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Contact No.</td>
                      <td style={valueStyle}>{cell(student.contact_no)}</td>
                      <td style={labelStyle}>Parent Contact No.</td>
                      <td style={valueStyle}>{cell(student.parent_contact_no)}</td>
                    </tr>
                    <tr>
                      <td style={labelStyle}>Date Of Birth</td>
                      <td style={valueStyle}>{student.date_of_birth || '—'}</td>
                      <td style={labelStyle}>Address</td>
                      <td style={valueStyle}>{cell(student.address)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <section className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-12 text-center text-sm text-neutral-600">
                Analytics for this student will be available in a future update.
              </section>
            )}
          </>
        )}
      </main>
    </>
  )
}
