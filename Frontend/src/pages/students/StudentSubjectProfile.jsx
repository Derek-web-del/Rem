import { useCallback, useEffect, useState } from 'react'
import { useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { fetchStudentSubject, StudentApiError } from '../../lib/studentPortal.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import SubjectDetailsCard from '../teachers/subject-detail/SubjectDetailsCard.jsx'
import StudentSubjectModulesTab from './StudentSubjectModulesTab.jsx'
import StudentSubjectGradesTab from './StudentSubjectGradesTab.jsx'

function SubjectTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'modules', label: 'Modules' },
    { id: 'grades', label: 'Grades' },
  ]
  return (
    <div className="flex gap-1 border-b border-neutral-200 px-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`border-b-2 px-3 py-2.5 text-sm font-medium transition ${
            activeTab === tab.id
              ? 'border-[#185FA5] text-[#185FA5]'
              : 'border-transparent text-neutral-500 hover:text-neutral-800'
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

export default function StudentSubjectProfile() {
  const location = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const { subjectId: routeSubjectId, id: legacySubjectId } = useParams()
  const subjectId = String(routeSubjectId || legacySubjectId || '').trim()
  const { logoutToPortal } = useOutletContext() || {}

  const [subject, setSubject] = useState(null)
  const [loadingSubject, setLoadingSubject] = useState(true)
  const [subjectError, setSubjectError] = useState(null)
  const [subjectNotFound, setSubjectNotFound] = useState(false)

  const tabParam = searchParams.get('tab')
  const resolveTab = (tab) => (tab === 'grades' ? 'grades' : 'modules')
  const [activeTab, setActiveTab] = useState(resolveTab(tabParam))

  useEffect(() => {
    if (tabParam) setActiveTab(resolveTab(tabParam))
  }, [tabParam])

  const handleTabChange = (tab) => {
    setActiveTab(tab)
    const next = new URLSearchParams(searchParams)
    if (tab === 'modules') next.delete('tab')
    else next.set('tab', tab)
    setSearchParams(next, { replace: true })
  }

  const loadSubject = useCallback(async () => {
    if (!subjectId) {
      setLoadingSubject(false)
      setSubject(null)
      setSubjectNotFound(false)
      setSubjectError('Invalid subject link.')
      return
    }
    setLoadingSubject(true)
    setSubjectError(null)
    setSubjectNotFound(false)
    try {
      const data = await fetchStudentSubject(subjectId)
      setSubject(data || null)
    } catch (e) {
      setSubject(null)
      const status = e instanceof StudentApiError ? e.status : null
      const msg = String(e?.message || e)
      if (status === 404 || /not found/i.test(msg)) {
        setSubjectNotFound(true)
        setSubjectError(null)
      } else {
        setSubjectNotFound(false)
        setSubjectError(msg || 'Failed to load subject. Please try again.')
      }
    } finally {
      setLoadingSubject(false)
    }
  }, [subjectId])

  useEffect(() => {
    void loadSubject()
  }, [loadSubject, location.key])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudentMainHeader onLogout={logoutToPortal} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <StudentViewHeader title="Subject" backTo="/student/subjects" />

        {loadingSubject ? (
          <p className="mt-4 text-sm text-neutral-500">Loading subject…</p>
        ) : subjectNotFound ? (
          <p className="mt-4 text-sm text-red-600">Subject not found.</p>
        ) : subjectError ? (
          <p className="mt-4 text-sm text-red-600">{subjectError}</p>
        ) : subject ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_280px]">
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-900">
                  {subject.subject_code ? `${subject.subject_code} — ` : ''}
                  {subject.subject_name}
                </div>
              </div>
              <SubjectTabBar activeTab={activeTab} onTabChange={handleTabChange} />
              {activeTab === 'modules' ? (
                <StudentSubjectModulesTab subjectId={subjectId} subject={subject} />
              ) : (
                <StudentSubjectGradesTab subjectId={subjectId} />
              )}
            </div>
            <SubjectDetailsCard subject={subject} />
          </div>
        ) : null}
      </div>
    </div>
  )
}
