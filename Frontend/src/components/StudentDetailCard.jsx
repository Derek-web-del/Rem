import { useMemo } from 'react'
import { facultyPhotoDisplaySrc } from '../lib/facultyPhoto.js'
import { formatSemesterLabel } from '../lib/quizQuestionTypes.js'
import { apiUrl } from '../lib/lmsStateStorage.js'

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

function cell(value) {
  const s = value != null ? String(value).trim() : ''
  return s || '—'
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

function deriveStatus(student) {
  if (!student) return 'Active'
  if (
    student.archivedAt ||
    student.archived_at ||
    student.archived === true ||
    student.isArchived === true
  ) {
    return 'Archived'
  }
  if (student.active === false || student.isActive === false || student.status === 'inactive') {
    return 'Inactive'
  }
  return 'Active'
}

function statusBadgeClass(status) {
  if (status === 'Archived') return 'border-neutral-300 bg-neutral-100 text-neutral-700'
  if (status === 'Inactive') return 'border-amber-200 bg-amber-50 text-amber-800'
  return 'border-emerald-200 bg-emerald-50 text-emerald-800'
}

export function normalizeStudentRecord(student) {
  if (!student) return null

  const fullName =
    String(student.name || student.full_name || student.fullName || '').trim() ||
    [student.firstName || student.first_name, student.middleName || student.middle_name, student.lastName || student.last_name]
      .map((p) => String(p ?? '').trim())
      .filter(Boolean)
      .join(' ')
      .trim()

  const enrollmentNo = String(student.enrollmentNo ?? student.enrollment_no ?? '').trim()
  const grade = String(student.grade ?? student.grade_level ?? '').trim()
  const sectionName = String(student.sectionName ?? student.section_name ?? student.section ?? '').trim()
  const semester = String(student.semester ?? student.semester ?? '1').trim()
  const sectionLabel = [grade, sectionName].map((p) => String(p ?? '').trim()).filter(Boolean).join('-') || '—'
  const photo = facultyPhotoDisplaySrc(student.photo_url || student.photoDataUrl || '', { apiUrlFn: apiUrl })
  const rawId = student.postgresStudentId ?? student.id
  const postgresId = Number.isFinite(Number(rawId)) && Number(rawId) > 0 ? String(Number(rawId)) : String(rawId || '').trim()
  const status = deriveStatus(student)
  const createdAt = String(
    student.createdAt ?? student.created_at ?? student.enrollmentDate ?? student.enrollment_date ?? '',
  ).trim()

  return {
    fullName,
    enrollmentNo,
    grade,
    sectionName,
    semester,
    sectionLabel,
    rollNo: student.rollNo ?? student.roll_no,
    email: student.email,
    phone: student.studentContactNumber ?? student.phone ?? student.contact_no ?? student.contactNo,
    parentContact: student.parentContactNumber ?? student.parent_contact_no ?? student.parent_contact,
    dateOfBirth: student.dateOfBirth ?? student.date_of_birth,
    address: student.studentAddress ?? student.address,
    photo,
    postgresId,
    status,
    createdAt,
  }
}

export function resolveStudentPostgresId(student) {
  const normalized = normalizeStudentRecord(student)
  return normalized?.postgresId || ''
}

export default function StudentDetailCard({
  student,
  showEditButton = false,
  onEdit,
  showHero = true,
  showTable = true,
  facultyView = false,
}) {
  const normalized = useMemo(() => normalizeStudentRecord(student), [student])

  if (!normalized) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
        <p className="text-sm font-medium text-neutral-600">Student not found.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {showHero ? (
        <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
          <div className="flex flex-wrap items-center gap-5">
            {normalized.photo ? (
              <img src={normalized.photo} alt="" className="size-20 rounded-xl object-cover ring-2 ring-neutral-100" />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
                {initials(normalized.fullName)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-2xl font-bold text-neutral-900">{normalized.fullName || '—'}</h3>
                <span
                  className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${statusBadgeClass(normalized.status)}`}
                >
                  {normalized.status}
                </span>
              </div>
              <p className="mt-1 text-sm text-neutral-600">Enrollment: {cell(normalized.enrollmentNo)}</p>
              {normalized.postgresId ? (
                <p className="mt-1 text-sm text-neutral-600">Student ID: {cell(normalized.postgresId)}</p>
              ) : null}
              <p className="mt-1 text-sm font-medium text-neutral-700">SEMESTER: {cell(formatSemesterLabel(normalized.semester))}</p>
              <p className="mt-1 text-sm font-medium text-neutral-700">SECTION: {normalized.sectionLabel}</p>
              {facultyView ? (
                <p className="mt-2 text-xs font-medium text-amber-800">
                  Faculty view — contact, address, and parent information are restricted. Grades are available on the Grades tab.
                </p>
              ) : null}
              {normalized.createdAt ? (
                <p className="mt-1 text-sm text-neutral-600">Enrolled: {cell(normalized.createdAt)}</p>
              ) : null}
            </div>
            {showEditButton && onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                Edit
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {showTable ? (
        <div
          style={{
            background: 'var(--color-background-primary, #ffffff)',
            border: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
            borderRadius: 'var(--border-radius-lg, 12px)',
            padding: '1.5rem',
          }}
        >
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3
              style={{
                fontWeight: '600',
                fontSize: '16px',
                color: 'var(--color-text-primary, #111827)',
              }}
            >
              Student Info:
            </h3>
            {showEditButton && onEdit && !showHero ? (
              <button
                type="button"
                onClick={onEdit}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-sm font-semibold text-neutral-700 shadow-sm hover:bg-neutral-50"
              >
                Edit
              </button>
            ) : null}
          </div>
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
                  {normalized.fullName || '—'}
                </td>
              </tr>
              <tr>
                <td style={labelStyle}>Enrollment No.</td>
                <td style={valueStyle}>{cell(normalized.enrollmentNo)}</td>
                <td style={labelStyle}>Grade Level</td>
                <td style={valueStyle}>{cell(normalized.grade)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Semester</td>
                <td style={valueStyle}>{cell(formatSemesterLabel(normalized.semester))}</td>
                <td style={labelStyle}>Section</td>
                <td style={valueStyle}>{cell(normalized.sectionName)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Roll No.</td>
                <td style={valueStyle}>{cell(normalized.rollNo)}</td>
                <td style={labelStyle}>Status</td>
                <td style={valueStyle}>{normalized.status}</td>
              </tr>
              {!facultyView ? (
                <>
                  <tr>
                    <td style={labelStyle}>E-mail</td>
                    <td style={valueStyle} colSpan={3}>
                      {cell(normalized.email)}
                    </td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Contact No.</td>
                    <td style={valueStyle}>{cell(normalized.phone)}</td>
                    <td style={labelStyle}>Parent Contact No.</td>
                    <td style={valueStyle}>{cell(normalized.parentContact)}</td>
                  </tr>
                  <tr>
                    <td style={labelStyle}>Date Of Birth</td>
                    <td style={valueStyle}>{cell(normalized.dateOfBirth)}</td>
                    <td style={labelStyle}>Address</td>
                    <td style={valueStyle}>{cell(normalized.address)}</td>
                  </tr>
                </>
              ) : null}
              <tr>
                {!facultyView ? (
                  <>
                    <td style={labelStyle}>Student ID</td>
                    <td style={valueStyle}>{cell(normalized.postgresId)}</td>
                  </>
                ) : (
                  <>
                    <td style={labelStyle}>Enrollment No.</td>
                    <td style={valueStyle} colSpan={3}>
                      {cell(normalized.enrollmentNo)}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  )
}
