import { useState } from 'react'
import SubjectGradesBreakdown from './SubjectGradesBreakdown.jsx'
import GradeOverrideModal from './GradeOverrideModal.jsx'
import LateSubmissionModal from './LateSubmissionModal.jsx'

export default function SubjectGradeBreakdownModal({
  subject,
  onClose,
  isAdmin = false,
  studentId,
  studentName,
  onGradesRefresh,
}) {
  const [overrideItem, setOverrideItem] = useState(null)
  const [lateSubmissionItem, setLateSubmissionItem] = useState(null)
  const [overrideSuccess, setOverrideSuccess] = useState('')

  if (!subject) return null

  const showWorkItems =
    (subject.quizzes?.length ?? 0) +
      (subject.assignments?.length ?? 0) +
      (subject.activities?.length ?? 0) >
    0

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        role="dialog"
        aria-modal="true"
        aria-labelledby="grade-breakdown-title"
        onClick={onClose}
      >
        <div
          className={`max-h-[90vh] w-full overflow-y-auto rounded-xl bg-white shadow-xl ${showWorkItems ? 'max-w-2xl' : 'max-w-lg'}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-neutral-200 px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div />
              <button
                type="button"
                className="rounded-md p-1 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
                onClick={onClose}
                aria-label="Close"
              >
                <i className="ti ti-x text-lg" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="px-5 py-4">
            {overrideSuccess ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {overrideSuccess}
              </div>
            ) : null}

            <SubjectGradesBreakdown
              subject={subject}
              showWorkItems={showWorkItems}
              isAdmin={isAdmin}
              onOverrideClick={setOverrideItem}
              onLateSubmissionClick={setLateSubmissionItem}
            />
          </div>

          <div className="border-t border-neutral-200 px-5 py-3">
            <button
              type="button"
              className="w-full rounded-md border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      {isAdmin && overrideItem ? (
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

      {isAdmin && lateSubmissionItem ? (
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
    </>
  )
}
