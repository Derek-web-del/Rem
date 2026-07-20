import { useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import PortalTermsMain from '../../components/PortalTermsMain.jsx'
import TermsAndConditions from '../../TermsAndConditions.jsx'
import { isTermsAccepted, setTermsAccepted } from '../../lib/termsSession.js'
import { acceptAdminTerms } from '../../lib/adminPortal.js'
import { authClient } from '../../lib/auth-client.js'
import { homePathForRole, normalizeRole } from '../../lib/roleAccess.js'
import AdminMainHeader from './AdminMainHeader.jsx'

const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_DISPLAY_NAME || 'Glendale School, Inc.'

export default function AdminTermsPage() {
  const navigate = useNavigate()
  const { data: sessionData } = authClient.useSession()
  const role = normalizeRole(sessionData?.user?.role)
  const portalLabel = role === 'registrar' ? 'REGISTRAR' : 'SCHOOL ADMIN'
  const gateMode = !isTermsAccepted()

  const goDashboard = useCallback(() => {
    navigate(homePathForRole(role), { replace: true })
  }, [navigate, role])

  const handleAccepted = useCallback(async () => {
    setTermsAccepted()
    try {
      await acceptAdminTerms()
    } catch (e) {
      console.warn('[AdminTermsPage] accept-terms API failed:', e?.message || e)
    }
    goDashboard()
  }, [goDashboard])

  return (
    <>
      <AdminMainHeader pageTitle="Terms and Policy" portalLabel={portalLabel} />
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
