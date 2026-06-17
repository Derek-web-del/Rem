import { useCallback, useEffect, useState } from 'react'

import { useNavigate, useOutletContext } from 'react-router-dom'

import PortalTermsMain from '../../components/PortalTermsMain.jsx'

import TermsAndConditions from '../../TermsAndConditions.jsx'

import { setTermsAccepted } from '../../lib/termsSession.js'

import { acceptStudentTerms, fetchStudentTermsStatus } from '../../lib/studentPortal.js'

import { useNotify } from '../../components/notifications.jsx'

import StudentMainHeader from './StudentMainHeader.jsx'



const SCHOOL_NAME = import.meta.env.VITE_SCHOOL_DISPLAY_NAME || 'Glendale School, Inc.'



export default function StudentTermsPage() {

  const navigate = useNavigate()

  const { setSidebarNavLocked } = useOutletContext() || {}

  const { error: notifyError } = useNotify()

  const [gateMode, setGateMode] = useState(true)

  const [statusLoading, setStatusLoading] = useState(true)



  useEffect(() => {

    let cancelled = false

    void (async () => {

      try {

        const status = await fetchStudentTermsStatus()

        if (cancelled) return

        if (status.accepted === true) {
          setTermsAccepted()
          setGateMode(false)
          setSidebarNavLocked?.(false)
          return
        }

        setGateMode(true)

        setSidebarNavLocked?.(true)

      } catch (e) {

        if (cancelled) return

        setGateMode(true)

        setSidebarNavLocked?.(true)

        console.warn('[StudentTermsPage] terms-status check failed:', e?.message || e)

      } finally {

        if (!cancelled) setStatusLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [navigate, setSidebarNavLocked])



  const goDashboard = useCallback(() => {

    setSidebarNavLocked?.(false)

    navigate('/student/dashboard', { replace: true })

  }, [navigate, setSidebarNavLocked])



  const handleAccepted = useCallback(async () => {

    try {

      await acceptStudentTerms()

      setTermsAccepted()

      goDashboard()

    } catch (e) {

      console.warn('[StudentTermsPage] accept-terms API failed:', e?.message || e)

      notifyError(String(e?.message || 'Failed to accept terms. Please try again.'))

    }

  }, [goDashboard, notifyError])



  if (statusLoading) {

    return (

      <div className="flex flex-1 items-center justify-center bg-neutral-100 text-sm font-medium text-neutral-600">

        Loading terms…

      </div>

    )

  }



  return (

    <>

      <StudentMainHeader pageTitle="Terms and Policy" />

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


