import { useEffect, useState } from 'react'
import { useOutletContext, useParams } from 'react-router-dom'
import {
  downloadAnnouncementImage,
  resolveAnnouncementImageSrc,
} from '../../lib/teacherAnnouncements.js'
import { fetchStudentAnnouncement } from '../../lib/studentPortal.js'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'

export default function StudentAnnouncementView() {
  const { id } = useParams()
  const { logoutToPortal } = useOutletContext() || {}

  const [item, setItem] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const row = await fetchStudentAnnouncement(id)
        if (!cancelled) setItem(row)
      } catch (e) {
        console.error('[StudentAnnouncementView]', e)
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

  const posted = item?.postedAt ? new Date(item.postedAt) : null
  const dateStr =
    posted && !Number.isNaN(posted.getTime())
      ? posted.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      : '—'

  const handleDownload = async () => {
    if (!item) return
    const ok = await downloadAnnouncementImage(item)
    if (!ok) console.warn('[StudentAnnouncementView] download failed')
  }

  return (
    <>
      <StudentMainHeader pageTitle="Announcements" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        {loading ? (
          <>
            <StudentViewHeader title="Announcement" backTo="/student/announcements" />
            <p className="text-sm text-neutral-500">Loading announcement…</p>
          </>
        ) : !item ? (
          <>
            <StudentViewHeader title="Announcement" backTo="/student/announcements" />
            <p className="text-sm text-neutral-600">Announcement not found.</p>
          </>
        ) : (
          <>
            <StudentViewHeader title="Announcement" backTo="/student/announcements" />
            <p className="-mt-3 text-sm text-neutral-500">{dateStr}</p>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
              <h3 className="text-sm font-bold text-neutral-600">Name Info:</h3>
              <div className="mt-4 space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Title</p>
                  <p className="mt-1 text-lg font-semibold text-neutral-900">{item.title}</p>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Message</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">
                    {item.description || item.message || '—'}
                  </p>
                </div>
                <div className="grid gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Uploaded By</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{item.uploadedBy || 'Institute'}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Announcement Type</p>
                    <p className="mt-1 text-sm font-medium text-neutral-800">{item.updateType || '—'}</p>
                  </div>
                </div>
              </div>
            </section>

            {imageSrc ? (
              <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
                <img
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
                  <button
                    type="button"
                    onClick={() => navigate('/student/announcements')}
                    className="ml-2 rounded-lg border border-blue-500 bg-white px-4 py-2 text-sm font-semibold text-blue-600 hover:bg-blue-50"
                  >
                    View
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
