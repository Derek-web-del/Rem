import { useEffect, useState } from 'react'
import { fetchMySubjectGrades } from '../../lib/gradesApi.js'
import SubjectGradesBreakdown from '../../components/SubjectGradesBreakdown.jsx'
import { GradesPanelSkeleton } from '../../components/GradesPanel.jsx'

export default function StudentSubjectGradesTab({ subjectId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [subjectGrades, setSubjectGrades] = useState(null)

  useEffect(() => {
    if (!subjectId) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      setError('')
      try {
        const data = await fetchMySubjectGrades(subjectId)
        if (!cancelled) setSubjectGrades(data?.subject ?? null)
      } catch (e) {
        if (!cancelled) {
          setSubjectGrades(null)
          setError(String(e?.message || 'Could not load grades.'))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subjectId])

  if (loading) {
    return (
      <div className="p-4">
        <GradesPanelSkeleton />
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      </div>
    )
  }

  if (!subjectGrades) {
    return (
      <div className="p-4">
        <p className="text-sm text-neutral-500">No grade data available.</p>
      </div>
    )
  }

  return (
    <div className="p-4 md:p-6">
      <SubjectGradesBreakdown subject={subjectGrades} />
    </div>
  )
}
