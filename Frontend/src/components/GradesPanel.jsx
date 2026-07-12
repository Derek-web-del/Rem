import { useState } from 'react'
import {
  displayGrade,
  formatGradeAvg,
  formatSubmittedAt,
  gradeStatusFromPercent,
} from '../lib/gradeStatus.js'
import GradeOverrideModal from './GradeOverrideModal.jsx'
import LateSubmissionModal from './LateSubmissionModal.jsx'

function SummaryTile({ label, value }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 text-center">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-neutral-900">{formatGradeAvg(value)}</p>
    </div>
  )
}

function ScoreBar({ percent, noScoresYet = false }) {
  const p = Math.max(0, Math.min(100, displayGrade(percent)))
  const { tone } = gradeStatusFromPercent(p, { noScoresYet })
  const barColor =
    tone === 'passed' ? 'bg-emerald-500' : tone === 'at_risk' ? 'bg-amber-500' : tone === 'failed' ? 'bg-red-500' : 'bg-neutral-300'
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-200">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${p}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-xs font-semibold text-neutral-700">{p}%</span>
    </div>
  )
}

function GradeItemRow({ item, readOnly, isAdmin, studentId, studentName, onOverrideClick, onLateSubmissionClick }) {
  return (
    <div className="flex flex-col gap-2 border-b border-neutral-100 py-3 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-neutral-900">{item.title}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-800">
            {item.subject || '—'}
          </span>
          <span className="text-xs text-neutral-500">{formatSubmittedAt(item.submitted_at)}</span>
          {item.is_locked ? (
            <span className="inline-flex items-center gap-1 text-xs text-neutral-500" title="Score locked after deadline">
              <i className="ti ti-lock" aria-hidden="true" />
              Locked
            </span>
          ) : null}
          {item.has_late_extension && item.late_submission_until ? (
            <span className="inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
              Late until {formatSubmittedAt(item.late_submission_until)}
            </span>
          ) : null}
          {item.is_no_submission ? (
            <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
              No submission
            </span>
          ) : null}
        </div>
      </div>
      <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[18rem] sm:flex-row sm:items-center">
        <div className="flex w-full flex-col gap-2 sm:w-72 sm:flex-row sm:items-center">
          <ScoreBar percent={item.percent} />
          {!readOnly && item.score != null && item.max_score != null ? (
            <span className="hidden text-xs text-neutral-500 sm:inline">
              {item.score}/{item.max_score}
            </span>
          ) : null}
        </div>
        {isAdmin && item.is_locked && item.entity_id ? (
          <div className="flex shrink-0 flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onLateSubmissionClick?.(item)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Allow Late Submission
            </button>
            <button
              type="button"
              onClick={() => onOverrideClick?.(item)}
              className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
            >
              Overwrite Score
            </button>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function CollapsibleSection({
  title,
  items,
  defaultOpen = false,
  readOnly = true,
  isAdmin,
  studentId,
  studentName,
  onOverrideClick,
  onLateSubmissionClick,
}) {
  const [open, setOpen] = useState(defaultOpen)
  const count = Array.isArray(items) ? items.length : 0

  return (
    <div className="rounded-lg border border-neutral-200 bg-white">
      <button
        type="button"
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-neutral-900">
          {title} <span className="font-normal text-neutral-500">({count})</span>
        </span>
        <i className={`ti ${open ? 'ti-chevron-up' : 'ti-chevron-down'} text-neutral-500`} aria-hidden="true" />
      </button>
      {open ? (
        <div className="border-t border-neutral-100 px-4 pb-2">
          {count === 0 ? (
            <p className="py-3 text-sm text-neutral-500">No scored submissions yet.</p>
          ) : (
            items.map((item) => (
              <GradeItemRow
                key={`${title}-${item.submission_id ?? item.title}`}
                item={item}
                readOnly={readOnly}
                isAdmin={isAdmin}
                studentId={studentId}
                studentName={studentName}
                onOverrideClick={onOverrideClick}
                onLateSubmissionClick={onLateSubmissionClick}
              />
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export function GradesPanelSkeleton() {
  return (
    <div className="animate-pulse space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="h-20 rounded-lg bg-neutral-200" />
        <div className="h-20 rounded-lg bg-neutral-200" />
        <div className="h-20 rounded-lg bg-neutral-200" />
      </div>
      <div className="h-24 rounded-lg bg-neutral-200" />
      <div className="h-24 rounded-lg bg-neutral-200" />
    </div>
  )
}

export default function GradesPanel({
  grades,
  loading,
  error,
  readOnly = true,
  showActivitySummary = true,
  emptyMessage = 'No grades recorded yet.',
  isAdmin = false,
  studentId,
  studentName,
  onGradesRefresh,
}) {
  const [overrideItem, setOverrideItem] = useState(null)
  const [lateSubmissionItem, setLateSubmissionItem] = useState(null)
  const [overrideSuccess, setOverrideSuccess] = useState('')

  if (loading) return <GradesPanelSkeleton />

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
    )
  }

  if (!grades) {
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
        {emptyMessage}
      </div>
    )
  }

  const noScoresYet = !grades.has_scored_items

  return (
    <div className="space-y-4">
      {overrideSuccess ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {overrideSuccess}
        </div>
      ) : null}

      <div className={`grid grid-cols-1 gap-3 ${showActivitySummary ? 'sm:grid-cols-3' : 'sm:grid-cols-3'}`}>
        <SummaryTile label="Overall average" value={grades.overall_avg} />
        <SummaryTile label="Quiz average" value={grades.quiz_avg} />
        <SummaryTile label="Assignment average" value={grades.assignment_avg} />
      </div>
      {showActivitySummary ? (
        <p className="text-xs text-neutral-500">
          Activity average: <span className="font-semibold text-neutral-800">{formatGradeAvg(grades.activity_avg)}</span>
        </p>
      ) : null}

      <CollapsibleSection
        title="Quizzes"
        items={grades.quizzes || []}
        defaultOpen
        readOnly={readOnly}
        isAdmin={isAdmin}
        studentId={studentId}
        studentName={studentName}
        onOverrideClick={setOverrideItem}
        onLateSubmissionClick={setLateSubmissionItem}
      />
      <CollapsibleSection
        title="Assignments"
        items={grades.assignments || []}
        readOnly={readOnly}
        isAdmin={isAdmin}
        studentId={studentId}
        studentName={studentName}
        onOverrideClick={setOverrideItem}
        onLateSubmissionClick={setLateSubmissionItem}
      />
      <CollapsibleSection
        title="Activities"
        items={grades.activities || []}
        readOnly={readOnly}
        isAdmin={isAdmin}
        studentId={studentId}
        studentName={studentName}
        onOverrideClick={setOverrideItem}
        onLateSubmissionClick={setLateSubmissionItem}
      />

      {overrideItem ? (
        <GradeOverrideModal
          item={overrideItem}
          studentId={studentId}
          studentName={studentName}
          onClose={() => setOverrideItem(null)}
          onSuccess={() => {
            setOverrideSuccess('Score overwritten and logged.')
            setOverrideItem(null)
            onGradesRefresh?.()
          }}
        />
      ) : null}

      {lateSubmissionItem ? (
        <LateSubmissionModal
          item={lateSubmissionItem}
          studentId={studentId}
          studentName={studentName}
          onClose={() => setLateSubmissionItem(null)}
          onSuccess={() => {
            setOverrideSuccess('Late submission allowed and logged.')
            setLateSubmissionItem(null)
            onGradesRefresh?.()
          }}
        />
      ) : null}
    </div>
  )
}

export function GradesStatusBadge() {
  return null
}

export function GradesScoreBar({ percent, noScoresYet = false }) {
  return <ScoreBar percent={percent} noScoresYet={noScoresYet} />
}
