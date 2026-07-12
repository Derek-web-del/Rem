import { useCallback, useEffect, useMemo, useState } from 'react'
import OfflineCacheIndicator from '../components/OfflineCacheIndicator.jsx'
import { fetchStudentGrades } from '../lib/gradesApi.js'
import StudentSubjectGradesPanel from './StudentSubjectGradesPanel.jsx'
import { resolveStudentPostgresId } from './StudentDetailCard.jsx'

function resolveStudentName(student) {
  if (!student) return ''
  const direct = String(student.name || student.full_name || student.fullName || '').trim()
  if (direct) return direct
  return [
    student.firstName || student.first_name,
    student.middleName || student.middle_name,
    student.lastName || student.last_name,
  ]
    .filter(Boolean)
    .join(' ')
}

export default function StudentGradesCard({
  studentId,
  student,
  readonly = true,
  isAdmin = false,
}) {
  const resolvedId = useMemo(() => {
    const fromProp = String(studentId ?? '').trim()
    if (fromProp) return fromProp
    return resolveStudentPostgresId(student)
  }, [studentId, student])

  const studentName = useMemo(() => resolveStudentName(student), [student])

  const [grades, setGrades] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  const teacherNoSubjectsMessage =
    'No subjects assigned to your faculty account yet. Grades will appear once admin assigns your subjects.'

  const loadGrades = useCallback(async () => {
    if (!resolvedId) return
    setLoading(true)
    setError('')
    try {
      const data = await fetchStudentGrades(resolvedId, { isAdmin })
      setGrades(data)
      setFromCache(Boolean(data.fromCache))
    } catch (e) {
      setGrades(null)
      setError(String(e?.message || e || 'Could not load grades.'))
    } finally {
      setLoading(false)
    }
  }, [resolvedId, isAdmin])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      if (!resolvedId) return
      setLoading(true)
      setError('')
      try {
        const data = await fetchStudentGrades(resolvedId, { isAdmin })
        if (!cancelled) {
          setGrades(data)
          setFromCache(Boolean(data.fromCache))
        }
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
  }, [resolvedId, isAdmin])

  const emptyMessage = isAdmin
    ? 'No gradable work items past deadline yet.'
    : teacherNoSubjectsMessage
  const noSubjectsMessage = isAdmin
    ? 'No subjects available for your grade level.'
    : teacherNoSubjectsMessage

  return (
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
          Grades
        </h3>
        {readonly ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-neutral-500">
            {isAdmin ? null : <i className="ti ti-lock" aria-hidden="true" />}
            Read-only
          </span>
        ) : null}
      </div>
      <OfflineCacheIndicator fromCache={fromCache} className="mb-3" />
      <StudentSubjectGradesPanel
        grades={grades}
        loading={loading}
        error={error}
        emptyMessage={emptyMessage}
        noSubjectsMessage={noSubjectsMessage}
        isAdmin={isAdmin}
        studentId={resolvedId}
        studentName={studentName}
        onGradesRefresh={loadGrades}
      />
    </div>
  )
}
