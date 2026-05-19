import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { facultyPhotoDisplaySrc } from './lib/facultyPhoto.js'
import { apiUrl } from './lib/lmsStateStorage.js'

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

export default function StudentProfile({ student, onBack }) {
  const [activeTab, setActiveTab] = useState('basic')

  const fullName = useMemo(() => {
    if (!student) return ''
    if (student.name) return student.name
    return `${student.firstName || ''} ${student.middleName || ''} ${student.lastName || ''}`.replace(/\s+/g, ' ').trim()
  }, [student])

  const enrollmentNo = String(student?.enrollmentNo || '').trim()
  const grade = student?.grade || ''
  const sectionName = student?.sectionName || ''
  const quarter = student?.semester || '1'
  const sectionLabel = [grade, sectionName].map((p) => String(p ?? '').trim()).filter(Boolean).join('-') || '—'
  const photo = facultyPhotoDisplaySrc(student?.photo_url || student?.photoDataUrl || '', { apiUrlFn: apiUrl })

  if (!student) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Student</p>
            <h2 className="mt-1 text-3xl font-bold text-neutral-900">Profile</h2>
          </div>
          <BackButton onClick={onBack} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
          <p className="text-sm font-medium text-neutral-600">Student not found.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Profile</h2>
        </div>
        <button
          type="button"
          className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
          onClick={onBack}
        >
          Back
        </button>
      </div>

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-wrap items-center gap-5">
          {photo ? (
            <img src={photo} alt="" className="size-20 rounded-xl object-cover ring-2 ring-neutral-100" />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
              {initials(fullName)}
            </div>
          )}
          <div>
            <h3 className="text-2xl font-bold text-neutral-900">{fullName || '—'}</h3>
            <p className="mt-1 text-sm text-neutral-600">Enrollment: {cell(enrollmentNo)}</p>
            <p className="mt-1 text-sm font-medium text-neutral-700">QUARTER: {cell(quarter)}</p>
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
                  {fullName || '—'}
                </td>
              </tr>
              <tr>
                <td style={labelStyle}>Enrollment No.</td>
                <td style={valueStyle}>{cell(enrollmentNo)}</td>
                <td style={labelStyle}>Grade Level</td>
                <td style={valueStyle}>{cell(grade)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Quarter</td>
                <td style={valueStyle}>{cell(quarter)}</td>
                <td style={labelStyle}>Section</td>
                <td style={valueStyle}>{cell(sectionName)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Roll No.</td>
                <td style={valueStyle}>{cell(student.rollNo)}</td>
                <td style={labelStyle}>E-mail</td>
                <td style={valueStyle}>{cell(student.email)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Contact No.</td>
                <td style={valueStyle}>{cell(student.studentContactNumber || student.phone)}</td>
                <td style={labelStyle}>Parent Contact No.</td>
                <td style={valueStyle}>{cell(student.parentContactNumber)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Date Of Birth</td>
                <td style={valueStyle}>{cell(student.dateOfBirth)}</td>
                <td style={labelStyle}>Address</td>
                <td style={valueStyle}>{cell(student.studentAddress)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : (
        <section className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50 px-4 py-12 text-center text-sm text-neutral-600">
          Analytics for this student will be available in a future update.
        </section>
      )}
    </div>
  )
}
