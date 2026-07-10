import { useCallback, useEffect, useState } from 'react'
import { useLocation, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { fetchStudentSubject, StudentApiError } from '../../lib/studentPortal.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'
import SubjectDetailsCard from '../teachers/subject-detail/SubjectDetailsCard.jsx'
import StudentSubjectModulesTab from './StudentSubjectModulesTab.jsx'
import StudentSubjectMaterialsTab from './StudentSubjectMaterialsTab.jsx'
import StudentSubjectGradesTab from './StudentSubjectGradesTab.jsx'
import { formatSubjectScheduleLabel } from '../../lib/subjectScheduleDisplay.js'

function SubjectTabBar({ activeTab, onTabChange }) {
  const tabs = [
    { id: 'modules', label: 'Modules' },
    { id: 'materials', label: 'Materials' },
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
  const resolveTab = (tab) => {
    if (tab === 'grades') return 'grades'
    if (tab === 'materials') return 'materials'
    return 'modules'
  }
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

  const scheduleLabel = subject ? formatSubjectScheduleLabel(subject) : ''

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <StudentMainHeader />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <StudentViewHeader title="Subject" backTo="/student/subjects" />

        {loadingSubject ? (
          <p className="mt-4 text-sm text-neutral-500">Loading subject…</p>
        ) : subjectNotFound ? (
          <p className="mt-4 text-sm text-red-600">Subject not found.</p>
        ) : subjectError ? (
          <p className="mt-4 text-sm text-red-600">{subjectError}</p>
        ) : subject ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
            <div className="flex max-h-[min(560px,70vh)] flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
                <div className="text-sm font-semibold text-neutral-900">
                  {subject.subject_code ? `${subject.subject_code} — ` : ''}
                  {subject.subject_name}
                </div>
                {scheduleLabel ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs font-medium text-sky-900">
                    <i className="ti ti-clock" aria-hidden="true" />
                    {scheduleLabel}
                  </div>
                ) : null}
              </div>
              <SubjectTabBar activeTab={activeTab} onTabChange={handleTabChange} />
              <div className="min-h-0 flex-1 overflow-y-auto">
                {activeTab === 'modules' ? (
                  <StudentSubjectModulesTab subjectId={subjectId} subject={subject} />
                ) : activeTab === 'materials' ? (
                  <StudentSubjectMaterialsTab subjectId={subjectId} />
                ) : (
                  <StudentSubjectGradesTab subjectId={subjectId} />
                )}
              </div>
            </div>
            <div className="space-y-4 lg:sticky lg:top-4">
              <SubjectDetailsCard subject={subject} />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
