import { displayGrade, formatGradeAvg, formatSubmittedAt } from '../lib/gradeStatus.js'
import { buildComponentWorkGroups, entityTypeLabel } from '../lib/gradeComponentWorkGroups.js'

function componentMapsTo(comp) {
  const labels = []
  if (comp.is_quiz) labels.push('Quiz')
  if (comp.maps_to_assignment) labels.push('Assignment')
  if (comp.maps_to_activity) labels.push('Activity')
  return labels.length ? labels.join(', ') : '—'
}

function WorkItemRow({ item, isAdmin, canAllowLateSubmission, onOverrideClick, onLateSubmissionClick }) {
  const scoreLabel =
    item.score != null && item.max_score != null ? `${item.score}/${item.max_score}` : '—'
  const typeLabel = entityTypeLabel(item.entity_type)
  const showLateSubmission = (isAdmin || canAllowLateSubmission) && item.is_locked

  return (
    <div className="flex flex-col gap-2 py-2 sm:flex-row sm:items-center sm:justify-between">
      <p className="min-w-0 flex-1 text-sm text-neutral-800">
        <span className="text-neutral-400" aria-hidden="true">
          -{' '}
        </span>
        <span className="mr-2 inline-flex rounded-full bg-neutral-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
          {typeLabel}
        </span>
        <span className="font-medium text-neutral-900">{item.title}</span>
        <span className="text-neutral-500"> — </span>
        <span className="tabular-nums text-neutral-700">{scoreLabel}</span>
        {item.is_locked ? (
          <span
            className="ml-2 inline-flex items-center gap-1 text-xs text-neutral-500"
            title="Score locked after deadline"
          >
            <i className="ti ti-lock" aria-hidden="true" />
            Locked
          </span>
        ) : null}
        {item.has_late_extension && item.late_submission_until ? (
          <span className="ml-2 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-800">
            Late until {formatSubmittedAt(item.late_submission_until)}
          </span>
        ) : null}
        {item.is_no_submission ? (
          <span className="ml-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
            No submission
          </span>
        ) : null}
      </p>
      {(isAdmin || canAllowLateSubmission) && item.entity_id ? (
        <div className="flex shrink-0 flex-wrap gap-2 self-start sm:self-center">
          {showLateSubmission ? (
            <>
              <button
                type="button"
                onClick={() => onLateSubmissionClick?.(item)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
              >
                Allow Late Submission
              </button>
              {isAdmin ? (
                <button
                  type="button"
                  onClick={() => onOverrideClick?.(item)}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                >
                  Overwrite Score
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function ComponentWorkSection({ comp, items, isAdmin, canAllowLateSubmission, onOverrideClick, onLateSubmissionClick }) {
  const weight =
    comp.percentage != null && Number.isFinite(Number(comp.percentage))
      ? ` (${Number(comp.percentage)}%)`
      : ''

  return (
    <div className="mt-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-neutral-900">
        <span
          className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
          style={{ backgroundColor: comp.color || '#3B82F6' }}
        />
        {comp.name}
        {weight}
      </h4>
      <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50/50 px-3 py-1">
        {items.map((item) => (
          <WorkItemRow
            key={`${comp.id}-${item.entity_type}-${item.submission_id ?? item.entity_id ?? item.title}`}
            item={item}
            isAdmin={isAdmin}
            canAllowLateSubmission={canAllowLateSubmission}
            onOverrideClick={onOverrideClick}
            onLateSubmissionClick={onLateSubmissionClick}
          />
        ))}
      </div>
    </div>
  )
}

export default function SubjectGradesBreakdown({
  subject,
  showWorkItems = true,
  isAdmin = false,
  canAllowLateSubmission = false,
  onOverrideClick,
  onLateSubmissionClick,
}) {
  if (!subject) return null

  const title = [subject.subject_name, subject.subject_code].filter(Boolean).join(' · ')
  const gradedIds = new Set((subject.graded_component_ids || []).map(String))
  const components = subject.components || []
  const noScoresYet = !subject.has_scored_items
  const componentWorkGroups = buildComponentWorkGroups(
    components,
    subject.quizzes,
    subject.assignments,
    subject.activities,
  )
  const showWorkList = showWorkItems && componentWorkGroups.length > 0

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-lg font-bold text-neutral-900">{title || 'Subject grades'}</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Overall:{' '}
          <span className="font-semibold text-neutral-900">
            {noScoresYet ? '—' : `${displayGrade(subject.overall_avg)}%`}
          </span>
        </p>
        {subject.graded_weight_total > 0 && subject.graded_weight_total < 100 ? (
          <p className="mt-0.5 text-xs text-neutral-500">
            Based on {subject.graded_weight_total}% of grading criteria graded
          </p>
        ) : null}
      </div>

      {components.length === 0 ? (
        <p className="text-sm text-neutral-500">No grade criteria configured for this subject yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-xs uppercase tracking-wide text-neutral-500">
              <th className="pb-2 pr-2 font-medium">Component</th>
              <th className="pb-2 pr-2 font-medium">Weight</th>
              <th className="pb-2 pr-2 font-medium">Maps to</th>
              <th className="pb-2 text-right font-medium">Score</th>
            </tr>
          </thead>
          <tbody>
            {components.map((comp) => {
              const isGraded = gradedIds.has(String(comp.id))
              const avg = subject.component_avgs?.[String(comp.id)]
              return (
                <tr key={comp.id} className="border-b border-neutral-100">
                  <td className="py-3 pr-2">
                    <span className="flex items-center gap-2 font-medium text-neutral-900">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: comp.color || '#3B82F6' }}
                      />
                      {comp.name}
                    </span>
                  </td>
                  <td className="py-3 pr-2 tabular-nums text-neutral-700">{comp.percentage}%</td>
                  <td className="py-3 pr-2 text-neutral-600">{componentMapsTo(comp)}</td>
                  <td className="py-3 text-right font-semibold tabular-nums text-neutral-900">
                    {isGraded && avg != null ? formatGradeAvg(displayGrade(avg)) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-200 font-semibold text-neutral-900">
              <td className="pt-3 pr-2" colSpan={3}>
                Overall
              </td>
              <td className="pt-3 text-right tabular-nums">
                {noScoresYet ? '—' : `${displayGrade(subject.overall_avg)}%`}
              </td>
            </tr>
          </tfoot>
        </table>
      )}

      {showWorkList ? (
        <div className="mt-6 border-t border-neutral-200 pt-4">
          <h4 className="text-sm font-semibold text-neutral-900">Graded work by component</h4>
          <p className="mt-0.5 text-xs text-neutral-500">
            Each item is grouped under the grading criteria it was created for.
          </p>
          {componentWorkGroups.map(({ comp, items }) => (
            <ComponentWorkSection
              key={comp.id}
              comp={comp}
              items={items}
              isAdmin={isAdmin}
            canAllowLateSubmission={canAllowLateSubmission}
              onOverrideClick={onOverrideClick}
              onLateSubmissionClick={onLateSubmissionClick}
            />
          ))}
        </div>
      ) : null}

      {noScoresYet && components.length > 0 && !showWorkList ? (
        <p className="mt-4 text-sm text-neutral-500">No grades recorded yet for this subject.</p>
      ) : null}
    </div>
  )
}
