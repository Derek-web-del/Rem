import { useState } from 'react'
import {
  displayGrade,
  gradeStatusBadgeClass,
  gradeStatusFromPercent,
} from '../lib/gradeStatus.js'
import { ACTION_BLUE } from '../pages/teachers/instituteChrome.js'
import { GradesPanelSkeleton } from './GradesPanel.jsx'
import SubjectGradeBreakdownModal from './SubjectGradeBreakdownModal.jsx'

function ScoreBar({ percent, noScoresYet = false }) {
  const p = Math.max(0, Math.min(100, displayGrade(percent)))
  const { tone } = gradeStatusFromPercent(p, { noScoresYet })
  const barColor =
    tone === 'passed'
      ? 'bg-emerald-500'
      : tone === 'at_risk'
        ? 'bg-amber-500'
        : tone === 'failed'
          ? 'bg-red-500'
          : 'bg-neutral-300'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-700">{p}%</span>
    </div>
  )
}

function StatusBadge({ percent, noScoresYet = false }) {
  const { label, tone } = gradeStatusFromPercent(percent, { noScoresYet })
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${gradeStatusBadgeClass(tone)}`}
    >
      {label}
    </span>
  )
}

function SubjectGradeCard({ subject, onView }) {
  const noScoresYet = !subject.has_scored_items
  const title = [subject.subject_name, subject.subject_code].filter(Boolean).join(' · ')

  return (
    <div className="rounded-lg border border-neutral-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-neutral-900">{title || '—'}</p>
          {subject.has_scored_items && subject.graded_weight_total > 0 ? (
            <p className="mt-0.5 text-xs text-neutral-500">
              Based on {subject.graded_weight_total}% of grading criteria graded
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-neutral-500">No grades recorded yet</p>
          )}
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[20rem] sm:flex-row sm:items-center">
          <ScoreBar percent={subject.overall_avg} noScoresYet={noScoresYet} />
          <StatusBadge percent={subject.overall_avg} noScoresYet={noScoresYet} />
          <button
            type="button"
            className="shrink-0 rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => onView(subject)}
          >
            View
          </button>
        </div>
      </div>
    </div>
  )
}

export default function StudentSubjectGradesPanel({
  grades,
  loading,
  error,
  emptyMessage = 'No grades recorded yet.',
  noSubjectsMessage = 'No subjects available for your grade level.',
  isAdmin = false,
  studentId,
  studentName,
  onGradesRefresh,
}) {
  const [selectedSubjectId, setSelectedSubjectId] = useState(null)

  if (loading) return <GradesPanelSkeleton />

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        {error}
      </div>
    )
  }

  const subjects = Array.isArray(grades?.subjects) ? grades.subjects : []
  const selectedSubject =
    selectedSubjectId != null
      ? subjects.find((s) => String(s.subject_id) === String(selectedSubjectId)) ?? null
      : null

  if (!grades) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
        {emptyMessage}
      </div>
    )
  }

  if (!subjects.length) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
        {noSubjectsMessage}
      </div>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {!grades.has_any_scores ? (
          <p className="text-sm text-neutral-500">{emptyMessage}</p>
        ) : null}
        {subjects.map((subject) => (
          <SubjectGradeCard
            key={subject.subject_id}
            subject={subject}
            onView={(subject) => setSelectedSubjectId(subject.subject_id)}
          />
        ))}
      </div>

      {selectedSubject ? (
        <SubjectGradeBreakdownModal
          subject={selectedSubject}
          onClose={() => setSelectedSubjectId(null)}
          isAdmin={isAdmin}
          studentId={studentId}
          studentName={studentName}
          onGradesRefresh={onGradesRefresh}
        />
      ) : null}
    </>
  )
}
