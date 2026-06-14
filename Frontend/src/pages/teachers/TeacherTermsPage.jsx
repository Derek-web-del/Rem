import { useCallback } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import PortalTermsMain from '../../components/PortalTermsMain.jsx'
import TermsAndConditions from '../../TermsAndConditions.jsx'
import { isTermsAccepted, setTermsAccepted } from '../../lib/termsSession.js'
import { acceptFacultyTerms } from '../../lib/facultyPortal.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_DISPLAY_NAME || 'Glendale School, Inc.'

export default function TeacherTermsPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const gateMode = !isTermsAccepted()

  const goDashboard = useCallback(() => {
    setSidebarNavLocked?.(false)
    navigate('/teacher/dashboard', { replace: true })
  }, [navigate, setSidebarNavLocked])

  const handleAccepted = useCallback(async () => {
    setTermsAccepted()
    try {
      await acceptFacultyTerms()
    } catch (e) {
      console.warn('[TeacherTermsPage] accept-terms API failed:', e?.message || e)
    }
    goDashboard()
  }, [goDashboard])

  return (
    <>
      <TeacherMainHeader pageTitle="Terms and Policy" onLogout={logoutToPortal} />
      <PortalTermsMain>
        <TermsAndConditions
          schoolName={SCHOOL_NAME}
          gateMode={gateMode}
          onAccepted={gateMode ? handleAccepted : undefined}
          onBack={gateMode ? undefined : goDashboard}
        />
      </PortalTermsMain>
    </>
  )
}
