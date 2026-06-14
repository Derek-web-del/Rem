import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { useNotify } from './components/notifications.jsx'
import { facultyPhotoDisplaySrc } from './lib/facultyPhoto.js'
import { formatSemesterLabel } from './lib/quizQuestionTypes.js'

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

function initials(name) {
  const parts = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const first = parts[0]?.[0] ?? '?'
  const last = parts.length > 1 ? parts[parts.length - 1][0] : ''
  return String(first + last).toUpperCase()
}

function cell(value) {
  const s = value != null ? String(value).trim() : ''
  return s || '—'
}

function formatFacultyGradeLevels(faculty) {
  const fromSections = [
    ...new Set(
      (faculty?.advisorySections || [])
        .map((s) => String(s?.grade_level ?? s?.grade ?? '').trim())
        .filter(Boolean),
    ),
  ]
  if (fromSections.length) return fromSections.join(', ')
  const listed = Array.isArray(faculty?.gradeLevels)
    ? faculty.gradeLevels.map((g) => String(g || '').trim()).filter(Boolean)
    : []
  if (listed.length) return listed.join(', ')
  return String(faculty?.grade_level ?? faculty?.grade ?? '').trim() || '—'
}

export default function FacultyProfile({ faculty, onBack, onSendPasswordResetEmail }) {
  const toast = useNotify()
  const [resetBusy, setResetBusy] = useState(false)
  const fullName = useMemo(() => {
    if (!faculty) return ''
    if (faculty.name) return faculty.name
    return `${faculty.firstName || ''} ${faculty.middleName || ''} ${faculty.lastName || ''}`.replace(/\s+/g, ' ').trim()
  }, [faculty])

  if (!faculty) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Faculty</p>
            <h2 className="mt-1 text-3xl font-bold text-neutral-900">Profile</h2>
          </div>
          <BackButton onClick={onBack} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
          <p className="text-sm font-medium text-neutral-600">Faculty not found.</p>
        </div>
      </div>
    )
  }

  const employeeId =
    String(
      faculty.employeeId ??
        faculty.employee_id ??
        faculty.facultyUsername ??
        faculty.facultyCode ??
        faculty.username ??
        faculty.loginId ??
        '',
    ).trim() || '—'
  const gradeLevels = formatFacultyGradeLevels(faculty)
  const advisoryText = (faculty.advisorySections || []).map((s) => s.name).filter(Boolean).join(', ') || '—'
  const semester = formatSemesterLabel(faculty.semester) || '—'
  const photoSrc = facultyPhotoDisplaySrc(faculty.photo_url || faculty.photoDataUrl || '')
  const isArchived =
    Boolean(faculty.archivedAt || faculty.archived_at || faculty.isArchived || faculty.is_archived) ||
    faculty.status === 'archived'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Profile</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {onSendPasswordResetEmail ? (
            <button
              type="button"
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              disabled={resetBusy}
              onClick={async () => {
                const email = String(faculty?.email || '').trim()
                if (!email) {
                  toast.error('No email on record for this faculty member.', { title: 'Reset email' })
                  return
                }
                setResetBusy(true)
                try {
                  const result = await onSendPasswordResetEmail(email)
                  if (result?.error) {
                    toast.error(result.error, { title: 'Reset email' })
                    return
                  }
                  toast.success(`Reset link sent to ${result?.maskedEmail || email}`, { title: 'Reset email' })
                } finally {
                  setResetBusy(false)
                }
              }}
            >
              {resetBusy ? 'Sending…' : 'Send Password Reset Email'}
            </button>
          ) : null}
          <button
            type="button"
            className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
            onClick={onBack}
          >
            Back
          </button>
        </div>
      </div>

      {isArchived ? (
        <div
          style={{
            background: '#FCEBEB',
            border: '0.5px solid #F09595',
            borderRadius: '8px',
            padding: '10px 16px',
            marginBottom: '16px',
            fontSize: '13px',
            color: '#791F1F',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <i className="ti ti-archive" aria-hidden />
          <span>Archived account — viewing historical record only.</span>
        </div>
      ) : null}

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-wrap items-center gap-5">
          {photoSrc ? (
            <img src={photoSrc} alt="" className="size-20 rounded-xl object-cover ring-2 ring-neutral-100" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
              {initials(fullName)}
            </div>
          )}
          <div>
            <h3 className="text-2xl font-bold text-neutral-900">{fullName || '—'}</h3>
            <p className="mt-1 text-sm text-neutral-600">Employee ID: {employeeId}</p>
            <p className="mt-1 text-sm font-medium text-neutral-700">GRADE LEVEL: {gradeLevels}</p>
            <p className="text-sm font-medium text-neutral-700">SECTIONS: {advisoryText}</p>
          </div>
        </div>
      </section>

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
          Faculty Info:
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
              <td style={labelStyle}>Faculty Name</td>
              <td style={valueStyle} colSpan={3}>
                {fullName || '—'}
              </td>
            </tr>
            <tr>
              <td style={labelStyle}>Employee ID</td>
              <td style={valueStyle}>{employeeId}</td>
              <td style={labelStyle}>Grade Level</td>
              <td style={valueStyle}>{cell(gradeLevels)}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Semester</td>
              <td style={valueStyle}>{cell(semester)}</td>
              <td style={labelStyle}>Section/Department</td>
              <td style={valueStyle}>{cell(advisoryText)}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Contact No.</td>
              <td style={valueStyle}>{cell(faculty.contactNumber)}</td>
              <td style={labelStyle}>E-mail</td>
              <td style={valueStyle}>{cell(faculty.email)}</td>
            </tr>
            <tr>
              <td style={labelStyle}>Qualification</td>
              <td style={valueStyle}>{cell(faculty.qualification)}</td>
              <td style={labelStyle}>Address</td>
              <td style={valueStyle}>{cell(faculty.address)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}
