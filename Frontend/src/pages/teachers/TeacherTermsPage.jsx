import { useEffect } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import TermsAndConditions, { TEACHER_TERMS_ACCEPTED_KEY } from '../../TermsAndConditions.jsx'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_DISPLAY_NAME || 'Glendale School, Inc.'

export default function TeacherTermsPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext()

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  return (
    <>
      <TeacherMainHeader pageTitle="Terms & Conditions" onLogout={logoutToPortal} />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="mx-auto w-full max-w-4xl pb-8">
          <TeacherBackButton to="/teacher/dashboard" />
          <TermsAndConditions
            schoolName={SCHOOL_NAME}
            acceptanceStorageKey={TEACHER_TERMS_ACCEPTED_KEY}
            onBack={() => navigate('/teacher/dashboard', { replace: false })}
          />
        </div>
      </main>
    </>
  )
}
