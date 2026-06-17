import { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import StudentDetailCard from '../../components/StudentDetailCard.jsx'
import StudentGradesCard from '../../components/StudentGradesCard.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'

export default function TeacherStudentDetails() {
  const { sectionId, studentId } = useParams()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}

  const [student, setStudent] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('basic')

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  const loadStudent = useCallback(async () => {
    if (!studentId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(apiUrl(`/api/teacher/student/${encodeURIComponent(studentId)}`), {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || data?.error || 'Failed to load student.')
      }
      setStudent(data)
    } catch (e) {
      setStudent(null)
      setError(String(e?.message || e))
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(() => {
    void loadStudent()
  }, [loadStudent])

  return (
    <>
      <TeacherMainHeader pageTitle="Sections" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:space-y-8 md:p-8">
        <TeacherBackButton
          to={
            sectionId
              ? `/teacher/sections/${encodeURIComponent(sectionId)}/students`
              : '/teacher/sections'
          }
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Students Profile</h2>
        </div>

        {loading ? (
          <div className="py-16 text-center text-sm text-neutral-500">Loading student profile…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
        ) : !student ? (
          <StudentDetailCard student={null} />
        ) : (
          <>
            <StudentDetailCard student={student} showHero showTable={false} showEditButton={false} />

            <div className="flex gap-2 border-b border-neutral-200">
              <button
                type="button"
                onClick={() => setActiveTab('basic')}
                className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                  activeTab === 'basic'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Basic Details
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('grades')}
                className={`border-b-2 px-4 py-2 text-sm font-semibold ${
                  activeTab === 'grades'
                    ? 'border-blue-600 text-blue-700'
                    : 'border-transparent text-neutral-500 hover:text-neutral-800'
                }`}
              >
                Grades
              </button>
            </div>

            {activeTab === 'basic' ? (
              <StudentDetailCard student={student} showHero={false} showEditButton={false} />
            ) : (
              <StudentGradesCard studentId={student.id} student={student} readonly />
            )}
          </>
        )}
      </main>
    </>
  )
}
