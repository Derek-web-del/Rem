import { useEffect, useMemo, useState } from 'react'
import { fetchStudentGrades } from '../lib/gradesApi.js'
import { displayGrade, gradeStatusFromPercent } from '../lib/gradeStatus.js'
import { resolveStudentPostgresId } from './StudentDetailCard.jsx'

function gradeToneClass(tone) {
  switch (tone) {
    case 'passed':
      return 'text-emerald-700'
    case 'at_risk':
      return 'text-amber-700'
    case 'failed':
      return 'text-red-700'
    default:
      return 'text-neutral-500'
  }
}

export default function StudentGradingReportCard({ studentId, student }) {
  const resolvedId = useMemo(() => {
    const fromProp = String(studentId ?? '').trim()
    if (fromProp) return fromProp
    return resolveStudentPostgresId(student)
  }, [studentId, student])

  const [grades, setGrades] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!resolvedId) return
      setLoading(true)
      setError('')
      try {
        const data = await fetchStudentGrades(resolvedId, { isAdmin: true })
        if (!cancelled) setGrades(data)
      } catch (e) {
        if (!cancelled) {
          setGrades(null)
          setError(String(e?.message || e || 'Could not load grades.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [resolvedId])

  const subjects = Array.isArray(grades?.subjects) ? grades.subjects : []
  const gradedSubjects = subjects.filter((s) => s.has_scored_items)
  const overallAvg = gradedSubjects.length
    ? Math.round(gradedSubjects.reduce((sum, s) => sum + displayGrade(s.overall_avg), 0) / gradedSubjects.length)
    : null

  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
      <h3 className="text-base font-semibold text-neutral-900">Grading Report Card</h3>

      {loading ? (
        <p className="mt-4 text-sm text-neutral-500">Loading grades…</p>
      ) : error ? (
        <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-700">{error}</p>
      ) : !subjects.length ? (
        <p className="mt-4 rounded-lg border border-dashed border-neutral-200 bg-neutral-50 px-4 py-8 text-center text-sm text-neutral-600">
          No subjects available for this student's grade level.
        </p>
      ) : (
        <table className="mt-4 w-full border-collapse text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              <th className="border-b border-neutral-200 px-2 py-2 text-left">Subject</th>
              <th className="border-b border-neutral-200 px-2 py-2 text-right">Final Grade</th>
            </tr>
          </thead>
          <tbody>
            {subjects.map((s) => {
              const graded = Boolean(s.has_scored_items)
              const tone = graded ? gradeStatusFromPercent(s.overall_avg).tone : 'neutral'
              return (
                <tr key={s.subject_id}>
                  <td className="border-b border-neutral-100 px-2 py-2.5 text-neutral-800">{s.subject_name}</td>
                  <td className={`border-b border-neutral-100 px-2 py-2.5 text-right font-semibold ${gradeToneClass(tone)}`}>
                    {graded ? displayGrade(s.overall_avg) : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className="px-2 pt-3 font-semibold text-neutral-900">Overall Average</td>
              <td
                className={`px-2 pt-3 text-right text-base font-bold ${
                  overallAvg == null ? 'text-neutral-500' : gradeToneClass(gradeStatusFromPercent(overallAvg).tone)
                }`}
              >
                {overallAvg == null ? '—' : overallAvg}
              </td>
            </tr>
          </tfoot>
        </table>
      )}
    </div>
  )
}
