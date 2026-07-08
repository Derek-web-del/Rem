import { useEffect, useState } from 'react'

import { useNavigate, useOutletContext } from 'react-router-dom'

import { facultyPhotoDisplaySrc } from '../../lib/facultyPhoto.js'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'

import { formatSemesterLabel } from '../../lib/quizQuestionTypes.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'

import { consumeAccessDenied } from '../../lib/roleAccess.js'
import { loginPathWithPortalId } from '../../lib/loginRoutes.js'

import {

  fetchStudentProfile,

  formatStudentDate,

  studentInitials,

  StudentApiError,

  warmStudentOfflineCache,

} from '../../lib/studentPortal.js'

import { fetchMyGrades } from '../../lib/gradesApi.js'
import { isOnline } from '../../lib/offlineSync.js'
import StudentSubjectGradesPanel from '../../components/StudentSubjectGradesPanel.jsx'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'

import { useNotify } from '../../components/notifications.jsx'

import StudentMainHeader from './StudentMainHeader.jsx'

import { SIDEBAR_GOLD, SIDEBAR_GOLD_DARK } from '../teachers/instituteChrome.js'



const HEADER_GRADIENT = `linear-gradient(90deg, ${SIDEBAR_GOLD} 0%, ${SIDEBAR_GOLD_DARK} 100%)`

const NA = 'N/A'



function InfoRow({ label, value }) {

  return (

    <div className="flex flex-wrap justify-between gap-2 border-b border-neutral-100 py-2.5 last:border-0">

      <dt className="text-sm font-medium text-neutral-500">{label}</dt>

      <dd className="text-sm font-semibold text-neutral-900">{value || NA}</dd>

    </div>

  )

}



export default function StudentDashboard() {

  const navigate = useNavigate()

  const { logoutToPortal } = useOutletContext() || {}

  const { error: notifyError } = useNotify()

  const [profile, setProfile] = useState(null)

  const [loading, setLoading] = useState(true)

  const [grades, setGrades] = useState(null)

  const [gradesLoading, setGradesLoading] = useState(true)

  const [gradesError, setGradesError] = useState('')

  const [fromCache, setFromCache] = useState(false)



  useEffect(() => {

    if (consumeAccessDenied()) {

      notifyError('Access denied.')

    }

  }, [notifyError])



  useEffect(() => {

    let cancelled = false

    ;(async () => {

      setLoading(true)

      try {

        const offline = !isOnline()

        const row = await fetchStudentProfile()

        if (!cancelled) {
          setProfile(row)
          setFromCache(offline)
          if (!offline) void warmStudentOfflineCache()
        }

      } catch (e) {

        if (!cancelled) {

          if (e instanceof StudentApiError) {

            if (e.status === 401) {

              navigate(loginPathWithPortalId('STUDENT'), { replace: true })

              return

            }

          }

          setProfile(null)

          notifyError(e?.message || 'Could not load your profile.')

        }

        console.error('[StudentDashboard]', e)

      } finally {

        if (!cancelled) setLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [navigate, notifyError])



  useEffect(() => {

    let cancelled = false

    ;(async () => {

      setGradesLoading(true)

      setGradesError('')

      try {

        const data = await fetchMyGrades()

        if (!cancelled) setGrades(data)

      } catch (e) {

        if (!cancelled) {

          setGrades(null)

          setGradesError(e?.message || 'Could not load grades.')

        }

      } finally {

        if (!cancelled) setGradesLoading(false)

      }

    })()

    return () => {

      cancelled = true

    }

  }, [])



  const photoSrc = facultyPhotoDisplaySrc(profile?.photoUrl, { apiUrlFn: apiUrl })

  const initials = studentInitials(profile?.fullName)

  const loginIdDisplay =
    profile?.loginId ||
    profile?.login_id ||
    profile?.studentLoginId ||
    NA
  const loginIdShown = loginIdDisplay !== NA ? loginIdDisplay : NA



  return (

    <>

      <StudentMainHeader pageTitle="Student Dashboard" />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <OfflineCacheIndicator fromCache={fromCache} className="mb-3" />

        {loading ? (

          <p className="text-sm text-neutral-500">Loading profile…</p>

        ) : !profile ? (

          <section className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
            <p className="text-sm font-medium text-neutral-800">Your profile could not be loaded.</p>
            <p className="mt-2 text-sm text-neutral-600">
              Contact your administrator if grade level, section, or account details are missing.
              You can still use the other modules from the sidebar.
            </p>
          </section>

        ) : (
          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">

              <div className="px-5 py-6 text-white md:px-8 md:py-8" style={{ background: HEADER_GRADIENT }}>

                <div className="flex flex-wrap items-center gap-5">

                  {photoSrc ? (
                    <AuthenticatedImage
                      src={photoSrc}
                      alt=""
                      className="h-24 w-24 rounded-xl border-2 border-white/30 object-cover shadow-md md:h-28 md:w-28"
                    />
                  ) : (

                    <div className="flex h-24 w-24 items-center justify-center rounded-xl border-2 border-white/30 bg-white/15 text-3xl font-bold text-white shadow-md md:h-28 md:w-28">

                      {initials}

                    </div>

                  )}

                  <div>

                    <h2 className="text-2xl font-bold md:text-3xl">{profile?.fullName || NA}</h2>

                    <p className="mt-1 text-sm text-white/85 md:text-base">Student Login ID: {loginIdShown}</p>

                  </div>

                </div>

              </div>



              <div className="grid grid-cols-1 gap-0 md:grid-cols-2">

                <div className="border-b border-neutral-200 p-5 md:border-b-0 md:border-r md:p-6">

                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">

                    Academic Information

                  </h3>

                  <dl>

                    <InfoRow label="Roll No" value={profile?.rollNo} />

                    <InfoRow label="Ongoing Semester" value={formatSemesterLabel(profile?.semester)} />

                    <InfoRow label="Grade Level" value={profile?.gradeLevel} />

                    <InfoRow label="Section" value={profile?.section} />

                  </dl>

                </div>

                <div className="p-5 md:p-6">

                  <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">

                    Contact Information

                  </h3>

                  <dl>

                    <InfoRow label="Primary Contact" value={profile?.primaryContact} />

                    <InfoRow label="Email Address" value={profile?.email} />

                    <InfoRow label="Date of Birth" value={formatStudentDate(profile?.dob)} />

                    <InfoRow label="Parent Contact" value={profile?.parentContact} />

                  </dl>

                </div>

              </div>
          </section>
        )}

        <section className="mt-6 overflow-hidden rounded-xl border border-neutral-200 bg-white p-5 shadow-sm md:p-6">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-neutral-900">Grades</h3>
          </div>
          <StudentSubjectGradesPanel
            grades={grades}
            loading={gradesLoading}
            error={gradesError}
          />
        </section>

      </main>

    </>

  )

}


