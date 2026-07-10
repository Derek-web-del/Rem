import { useMemo, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { apiUrl } from './lib/lmsStateStorage.js'
import { formatSemesterLabel } from './lib/quizQuestionTypes.js'
import SubjectCoverImage from './components/SubjectCoverImage.jsx'
import { formatSubjectScheduleLabel } from './lib/subjectScheduleDisplay.js'

function formatSubjectSchedule(subject) {
  return formatSubjectScheduleLabel(subject) || '—'
}

function curriculumGuideDisplay(subject) {
  const title = String(subject?.curriculumGuideTitle ?? '').trim()
  const grade = String(subject?.curriculumGuideGrade ?? '').trim()
  if (title && grade) return `${grade} — ${title}`
  if (title) return title
  if (subject?.curriculumGuideId) return 'Linked institute guide'
  return '—'
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

export default function SubjectProfile({ subject, onBack, onEdit }) {
  const [tab, setTab] = useState('basic')

  const assignedFaculty = useMemo(
    () => subject?.assignedFacultyName || subject?.faculty_name || '—',
    [subject],
  )

  if (!subject) {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Subject</p>
            <h2 className="mt-1 text-3xl font-bold text-neutral-900">Profile</h2>
          </div>
          <BackButton onClick={onBack} />
        </div>
        <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
          <p className="text-sm font-medium text-neutral-600">Subject not found.</p>
        </div>
      </div>
    )
  }

  const grade = subject?.grade || subject?.grade_level || '—'
  const semester = formatSemesterLabel(subject?.semester) || '—'
  const scheduleLabel = formatSubjectSchedule(subject)
  const curriculumGuide = curriculumGuideDisplay(subject)
  const syllabusRaw = String(subject.syllabusDataUrl || subject.syllabus_pdf || '').trim()
  const syllabusFileName = subject.syllabusFileName || 'syllabus.pdf'
  const syllabusUrl =
    syllabusRaw && subject.id ? apiUrl(`/api/v1/subjects/${subject.id}/syllabus-file`) : ''

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Subject</p>
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Profile</h2>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <SubjectCoverImage
              subject={subject}
              alt={subject.subjectName || 'Subject'}
              className="size-20 shrink-0 rounded-xl border border-neutral-200 object-cover"
            />
            <div className="min-w-0">
              <div className="truncate text-xl font-bold text-neutral-900">{subject.subjectName || '—'}</div>
              <div className="mt-1 text-sm font-semibold text-neutral-500">{subject.subjectCode || '—'}</div>
            </div>
          </div>
          <button
            type="button"
            className="rounded bg-amber-400 px-4 py-2 text-sm font-semibold text-neutral-900 hover:brightness-110"
            onClick={onEdit}
          >
            Edit Details
          </button>
        </div>

        <div className="mt-5 border-b border-neutral-200">
          <div className="flex gap-6">
            <button
              type="button"
              className={`-mb-px border-b-2 px-1 pb-3 text-sm font-semibold ${
                tab === 'basic' ? 'border-blue-700 text-neutral-900' : 'border-transparent text-neutral-500 hover:text-neutral-700'
              }`}
              onClick={() => setTab('basic')}
            >
              Basic Details
            </button>
          </div>
        </div>

        {tab === 'basic' ? (
          <div
            className="mt-5"
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
              Subject Info:
            </h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
              <tbody>
                <tr>
                  <td style={labelStyle}>Subject Name</td>
                  <td style={valueStyle} colSpan={3}>
                    {cell(subject.subjectName)}
                  </td>
                </tr>
                <tr>
                  <td style={labelStyle}>Subject Semester</td>
                  <td style={valueStyle}>{cell(semester)}</td>
                  <td style={labelStyle}>Subject Grade Level</td>
                  <td style={valueStyle}>{cell(grade)}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Subject Faculty</td>
                  <td style={valueStyle}>{cell(assignedFaculty)}</td>
                  <td style={labelStyle}>Subject Code</td>
                  <td style={valueStyle}>{cell(subject.subjectCode)}</td>
                </tr>
                <tr>
                  <td style={labelStyle}>Institute Curriculum Guide</td>
                  <td style={valueStyle} colSpan={3}>
                    {cell(curriculumGuide)}
                  </td>
                </tr>
                <tr>
                  <td style={labelStyle}>Class Schedule</td>
                  <td style={valueStyle} colSpan={3}>
                    {cell(scheduleLabel)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="mt-5 rounded-xl border border-neutral-200 bg-white p-4">
          <div>
            <div className="text-sm font-semibold text-neutral-900">Syllabus Preview</div>
            <div className="text-xs text-neutral-500">
              {syllabusUrl ? syllabusFileName : 'Assigned teacher uploads the syllabus from the Teacher portal.'}
            </div>
          </div>

          {syllabusUrl ? (
            <div className="mt-3 h-[420px] overflow-hidden rounded-xl border border-neutral-200 bg-white">
              <iframe title="Syllabus PDF" src={syllabusUrl} className="h-full w-full" />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}
