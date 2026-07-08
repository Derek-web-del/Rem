import AuthenticatedImage from './AuthenticatedImage.jsx'
import { facultyPhotoDisplaySrc } from '../lib/facultyPhoto.js'
import { formatSemesterLabel } from '../lib/quizQuestionTypes.js'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'
import { apiUrl } from '../lib/lmsStateStorage.js'

const archivedBannerStyle = {
  background: '#FAEEDA',
  border: '0.5px solid #EF9F27',
  borderRadius: '8px',
  padding: '10px 16px',
  marginBottom: '16px',
  fontSize: '13px',
  color: '#633806',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
}

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

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
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

function FileLink({ filePath, fileName, fileAvailable }) {
  if (!filePath) return <span className="text-neutral-400">—</span>
  if (fileAvailable === false) {
    return <span className="text-sm text-neutral-500 italic">File no longer available</span>
  }
  const href = uploadsPathToApiUrl(filePath)
  if (!href) return <span className="text-neutral-400">—</span>
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm font-medium text-indigo-600 hover:text-indigo-800"
    >
      {cell(fileName) || 'Download'}
    </a>
  )
}

function WorkTable({ title, columns, rows, emptyMessage }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
      <h3 className="mb-4 text-base font-semibold text-neutral-900">{title}</h3>
      {!rows?.length ? (
        <p className="text-sm text-neutral-500">{emptyMessage}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full border-collapse text-left text-sm">
            <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <tr>
                {columns.map((col) => (
                  <th key={col.key} className="px-3 py-2">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100">
              {rows.map((row, idx) => (
                <tr key={row.id ?? idx} className="text-neutral-800">
                  {columns.map((col) => (
                    <td key={col.key} className="px-3 py-2.5">
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function StatsRow({ stats }) {
  const items = [
    { label: 'Total Assignments', value: stats?.total_assignments },
    { label: 'Total Activities', value: stats?.total_activities },
    { label: 'Total Materials', value: stats?.total_materials },
    { label: 'Total Quizzes', value: stats?.total_quizzes },
  ]
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
      <h3 className="mb-4 text-base font-semibold text-neutral-900">Work Statistics</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{item.label}</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">{item.value ?? 0}</p>
          </div>
        ))}
      </div>
      {stats?.total_announcements != null ? (
        <p className="mt-3 text-sm text-neutral-600">
          Announcements posted: <span className="font-semibold">{stats.total_announcements}</span>
        </p>
      ) : null}
    </section>
  )
}

export default function ArchivedFacultyDetail({ data }) {
  if (!data) return null

  const faculty = data.faculty || {}
  const work = data.work || {}
  const fullName =
    String(faculty.name || '').trim() ||
    [faculty.first_name, faculty.middle_name, faculty.last_name].filter(Boolean).join(' ').trim() ||
    '—'
  const employeeId =
    String(
      faculty.faculty_code_id ??
        faculty.facultyUsername ??
        faculty.facultyCode ??
        faculty.employee_id ??
        '',
    ).trim() || '—'
  const gradeLevels = formatFacultyGradeLevels(faculty)
  const advisoryText =
    (faculty.advisorySections || []).map((s) => s.name).filter(Boolean).join(', ') || '—'
  const photoSrc = facultyPhotoDisplaySrc(faculty.photo_url || faculty.photoDataUrl || '')

  return (
    <div className="space-y-6">
      {data.is_archived ? (
        <div style={archivedBannerStyle}>
          <i className="ti ti-archive" aria-hidden />
          <span>This faculty account is archived. Work history shown in read-only mode.</span>
        </div>
      ) : null}

      <section className="rounded-xl border border-neutral-100 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-wrap items-center gap-5">
          {photoSrc ? (
            <AuthenticatedImage
              src={photoSrc}
              alt=""
              className="size-20 rounded-xl object-cover ring-2 ring-neutral-100"
              fallback={
                <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
                  {initials(fullName)}
                </div>
              }
            />
          ) : (
            <div className="flex size-20 items-center justify-center rounded-xl bg-sky-100 text-xl font-bold text-sky-800">
              {initials(fullName)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h3 className="text-2xl font-bold text-neutral-900">{fullName}</h3>
            <p className="mt-1 text-sm text-neutral-600">Employee ID: {employeeId}</p>
          </div>
        </div>
        <div
          className="mt-6 overflow-x-auto"
          style={{
            border: '0.5px solid var(--color-border-tertiary, #e5e7eb)',
            borderRadius: 'var(--border-radius-lg, 12px)',
          }}
        >
          <table className="w-full border-collapse text-left" style={{ tableLayout: 'fixed' }}>
            <tbody>
              <tr>
                <td style={labelStyle}>Email</td>
                <td style={valueStyle}>{cell(faculty.email)}</td>
                <td style={labelStyle}>Contact</td>
                <td style={valueStyle}>{cell(faculty.contact_number ?? faculty.contactNumber)}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Qualification</td>
                <td style={valueStyle}>{cell(faculty.qualification)}</td>
                <td style={labelStyle}>Semester</td>
                <td style={valueStyle}>{cell(formatSemesterLabel(faculty.semester))}</td>
              </tr>
              <tr>
                <td style={labelStyle}>Grade levels</td>
                <td style={valueStyle}>{cell(gradeLevels)}</td>
                <td style={labelStyle}>Sections assigned</td>
                <td style={valueStyle}>{cell(advisoryText)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <StatsRow stats={data.stats} />

      <WorkTable
        title="Assignments Created"
        emptyMessage="No assignments on record for this faculty."
        rows={work.assignments || []}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject_name) },
          { key: 'due', label: 'Due Date', render: (r) => formatDate(r.due_date ?? r.submission_deadline) },
          { key: 'subs', label: 'Submissions', render: (r) => String(r.submissions_count ?? 0) },
        ]}
      />

      <WorkTable
        title="Activities Created"
        emptyMessage="No activities on record for this faculty."
        rows={work.activities || []}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject_name) },
          { key: 'created', label: 'Created date', render: (r) => formatDate(r.created_at) },
        ]}
      />

      <WorkTable
        title="Study Materials Uploaded"
        emptyMessage="No study materials on record for this faculty."
        rows={work.study_materials || []}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject) },
          {
            key: 'file',
            label: 'File',
            render: (r) => (
              <FileLink filePath={r.file_url} fileName={r.file_name} fileAvailable={r.file_available} />
            ),
          },
          { key: 'uploaded', label: 'Uploaded', render: (r) => formatDate(r.created_at) },
        ]}
      />

      <WorkTable
        title="Announcements Posted"
        emptyMessage="No announcements on record for this faculty."
        rows={work.announcements || []}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.title) },
          { key: 'category', label: 'Category', render: (r) => cell(r.type ?? r.updateType) },
          { key: 'date', label: 'Date Posted', render: (r) => formatDate(r.created_at ?? r.createdAt) },
        ]}
      />

      <WorkTable
        title="Quizzes Created"
        emptyMessage="No quizzes on record for this faculty."
        rows={work.quizzes || []}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject_name ?? r.subject) },
          { key: 'questions', label: 'Questions', render: (r) => String(r.questions_count ?? 0) },
          { key: 'created', label: 'Created date', render: (r) => formatDate(r.created_at) },
        ]}
      />
    </div>
  )
}
