import StudentDetailCard from './StudentDetailCard.jsx'
import { uploadsPathToApiUrl } from '../lib/fileUrls.js'
import { formatGradeAvg } from '../lib/gradeStatus.js'

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

function formatScore(score, max) {
  const s = score == null || !Number.isFinite(Number(score)) ? 0 : Number(score)
  const m = max != null && Number.isFinite(Number(max)) ? Number(max) : null
  return m != null ? `${s} / ${m}` : String(s)
}

function mapStudentForCard(student) {
  if (!student) return null
  return {
    ...student,
    postgresStudentId: student.id,
    enrollmentNo: student.enrollment_no,
    grade: student.grade_level,
    sectionName: student.section_name,
    studentContactNumber: student.contact_no,
    dateOfBirth: student.dob,
    parentContactNumber: student.parent_contact,
    parentEmail: student.parent_email,
    archived_at: student.archived_at,
    archivedAt: student.archived_at,
    isArchived: student.is_archived,
  }
}

function SubmissionFileLink({ filePath, fileName, fileAvailable }) {
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

function GradesSummary({ grades }) {
  const items = [
    { label: 'Overall avg', value: grades?.overall_avg },
    { label: 'Quiz avg', value: grades?.quiz_avg },
    { label: 'Assignment avg', value: grades?.assignment_avg },
    { label: 'Activity avg', value: grades?.activity_avg },
  ]
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
      <h3 className="mb-4 text-base font-semibold text-neutral-900">Grades Summary</h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {items.map((item) => (
          <div key={item.label} className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-neutral-500">{item.label}</p>
            <p className="mt-1 text-xl font-bold text-neutral-900">
              {formatGradeAvg(item.value)}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

export default function ArchivedStudentDetail({ data }) {
  if (!data) return null

  const student = mapStudentForCard(data.student)
  const assignments = data.work?.assignment_submissions || []
  const activities = data.work?.activity_submissions || []
  const quizzes = data.work?.quiz_submissions || []

  return (
    <div className="space-y-6">
      {data.is_archived ? (
        <div style={archivedBannerStyle}>
          <i className="ti ti-archive" aria-hidden />
          <span>This account is archived. Work history is shown in read-only mode.</span>
        </div>
      ) : null}

      <StudentDetailCard student={student} showEditButton={false} showTable />

      <GradesSummary grades={data.grades} />

      <WorkTable
        title="Assignment Submissions"
        emptyMessage="No assignments on record for this student."
        rows={assignments}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.assignment_title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject) },
          { key: 'score', label: 'Score', render: (r) => formatScore(r.score, r.max_score) },
          { key: 'submitted', label: 'Submitted', render: (r) => formatDate(r.submitted_at) },
          {
            key: 'file',
            label: 'File',
            render: (r) => (
              <SubmissionFileLink
                filePath={r.file_path}
                fileName={r.file_name}
                fileAvailable={r.file_available}
              />
            ),
          },
        ]}
      />

      <WorkTable
        title="Activity Submissions"
        emptyMessage="No activities on record for this student."
        rows={activities}
        columns={[
          { key: 'title', label: 'Title', render: (r) => cell(r.activity_title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject) },
          { key: 'score', label: 'Score', render: (r) => formatScore(r.score, r.max_score) },
          { key: 'submitted', label: 'Submitted', render: (r) => formatDate(r.submitted_at) },
          {
            key: 'file',
            label: 'File',
            render: (r) => (
              <SubmissionFileLink
                filePath={r.file_path}
                fileName={r.file_name}
                fileAvailable={r.file_available}
              />
            ),
          },
        ]}
      />

      <WorkTable
        title="Quiz Results"
        emptyMessage="No quizzes on record for this student."
        rows={quizzes}
        columns={[
          { key: 'title', label: 'Quiz title', render: (r) => cell(r.quiz_title) },
          { key: 'subject', label: 'Subject', render: (r) => cell(r.subject) },
          { key: 'score', label: 'Score', render: (r) => formatScore(r.score, r.total_points) },
          { key: 'date', label: 'Date', render: (r) => formatDate(r.submitted_at) },
        ]}
      />
    </div>
  )
}
