import { useEffect, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'
import {
  downloadAnnouncementImage,
  fetchTeacherAnnouncement,
  resolveAnnouncementImageSrc,
} from '../../lib/teacherAnnouncements.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_ANNOUNCEMENT_TOAST_MS, useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'

export default function TeacherAnnouncementView() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const row = await fetchTeacherAnnouncement(id)
        if (!cancelled) setItem(row)
      } catch (e) {
        console.error('[TeacherAnnouncementView]', e)
        if (!cancelled) setItem(null)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [id])

  const imageSrc = resolveAnnouncementImageSrc(item)

  const handleDownload = async () => {
    if (!item) return
    toast.success(FACULTY_MSG.announcements.downloading, {
      toastId: FACULTY_TOAST_ID.announcementDownload,
      durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
    })
    const ok = await downloadAnnouncementImage(item)
    if (!ok) console.warn('[TeacherAnnouncementView] download failed')
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Announcements" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Update</h2>
          </div>
            <BackButton to="/teacher/announcements" className="" />
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading announcement…</p>
        ) : !item ? (
          <p className="text-sm text-neutral-600">Announcement not found.</p>
        ) : (
          <>
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
              <h3 className="text-sm font-bold text-neutral-600">Name Info:</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Title</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">{item.title}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Description</p>
                  <textarea
                    readOnly
                    rows={6}
                    value={item.description}
                    className="mt-1 max-h-48 w-full resize-y overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm leading-relaxed text-neutral-800 outline-none"
                  />
                </div>
                <div className="grid gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Uploaded By</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{item.uploadedBy}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Update Type</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{item.updateType}</p>
                  </div>
                </div>
              </div>
            </section>

            {imageSrc ? (
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
                <AuthenticatedImage
                  src={imageSrc}
                  alt=""
                  className="max-h-[480px] w-full bg-neutral-50 object-contain"
                />
                <div className="border-t border-neutral-100 p-4">
                  <button
                    type="button"
                    onClick={() => void handleDownload()}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
                  >
                    Download
                  </button>
                </div>
              </div>
            ) : (
              <p className="text-sm text-neutral-500">No image attached.</p>
            )}
          </>
        )}
      </main>
    </>
  )
}
