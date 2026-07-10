import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams, useSearchParams } from 'react-router-dom'
import { fetchTeacherSubject } from '../../lib/teacherSubjectCurriculum.js'
import { invalidateTeacherSubjectsCache } from '../../lib/teacherPortalOffline.js'
import { useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import SubjectDetailTabs from './subject-detail/SubjectDetailTabs.jsx'
import SubjectDetailTopBar from './subject-detail/SubjectDetailTopBar.jsx'
import SubjectDetailsCard from './subject-detail/SubjectDetailsCard.jsx'
import SubjectCurriculumGuideCard from './subject-detail/SubjectCurriculumGuideCard.jsx'
import SubjectWorkflowStrip from './subject-detail/SubjectWorkflowStrip.jsx'
import SubjectSyllabusCard from './subject-detail/SubjectSyllabusCard.jsx'
import SubjectClassworkTab from './subject-detail/tabs/SubjectClassworkTab.jsx'
import SubjectGradesTab from './subject-detail/tabs/SubjectGradesTab.jsx'
import SubjectModulesTab from './subject-detail/tabs/SubjectModulesTab.jsx'

export default function TeacherSubjectDetail() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const [subject, setSubject] = useState(null)
  const [loading, setLoading] = useState(true)
  const tabParam = searchParams.get('tab')
  const resolveTab = (tab) => {
    if (tab === 'classwork' || tab === 'grades') return tab
    if (tab === 'modules' || tab === 'stream') return 'modules'
    return 'modules'
  }
  const initialTab = resolveTab(tabParam)
  const [activeTab, setActiveTab] = useState(initialTab)

  useEffect(() => {
    if (tabParam) setActiveTab(resolveTab(tabParam))
  }, [tabParam])

  const loadSubject = useCallback(async () => {
    setLoading(true)
    try {
      const row = await fetchTeacherSubject(subjectId)
      const resolvedFrom = String(row?.resolved_from_subject_id || '').trim()
      const activeId = String(row?.id || subjectId).trim()
      if (resolvedFrom && resolvedFrom !== String(subjectId)) {
        navigate(`/teacher/subjects/${encodeURIComponent(activeId)}`, { replace: true })
        return
      }
      setSubject(row)
    } catch (e) {
      const msg = String(e?.message || 'Subject not found.')
      if (/not found/i.test(msg)) {
        await invalidateTeacherSubjectsCache().catch(() => {})
        try {
          const { fetchTeacherSubjects } = await import('../../lib/teacherPortalOffline.js')
          const list = await fetchTeacherSubjects({ forceRefresh: true })
          if (list.some((s) => String(s.id) === String(subjectId))) {
            const row = await fetchTeacherSubject(subjectId)
            setSubject(row)
            return
          }
        } catch {
          void 0
        }
        toast.error('This subject could not be loaded. Open it again from your Subjects list.')
        navigate('/teacher/subjects', { replace: true })
        return
      }
      toast.error(msg)
      setSubject(null)
    } finally {
      setLoading(false)
    }
  }, [subjectId, toast, navigate])

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    void loadSubject()
  }, [loadSubject])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TeacherMainHeader logoutToPortal={logoutToPortal} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-4">
          <TeacherBackButton to="/teacher/subjects" label="Back to subjects" />
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading subject…</p>
        ) : !subject ? (
          <p className="text-sm text-red-600">Subject not found.</p>
        ) : (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
              <SubjectDetailTopBar subject={subject} />
              <SubjectDetailTabs activeTab={activeTab} onChange={setActiveTab} />
              <div className="overflow-visible">
                {activeTab === 'modules' ? <SubjectModulesTab subjectId={subjectId} subject={subject} /> : null}
                {activeTab === 'classwork' ? <SubjectClassworkTab subjectId={subjectId} /> : null}
                {activeTab === 'grades' ? <SubjectGradesTab subjectId={subjectId} subject={subject} /> : null}
              </div>
            </div>
            <div className="space-y-4">
              <SubjectWorkflowStrip subject={subject} />
              <SubjectDetailsCard subject={subject} />
              <SubjectCurriculumGuideCard subject={subject} />
              <SubjectSyllabusCard subject={subject} subjectId={subjectId} onUpdated={loadSubject} />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
