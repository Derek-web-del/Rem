import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { isOnline } from '../../lib/offlineSync.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'
import {
  downloadAnnouncementImage,
  fetchTeacherAnnouncements,
  formatDatePosted,
  resolveAnnouncementImageSrc,
} from '../../lib/teacherAnnouncements.js'
import { FACULTY_MSG, FACULTY_TOAST_ID, FACULTY_ANNOUNCEMENT_TOAST_MS, useFacultyNotify } from '../../lib/facultyNotify.js'
import TeacherBackButton from './TeacherBackButton.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

const cardActionClass =
  'inline-flex items-center gap-1.5 rounded border border-emerald-600 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-50'

export default function TeacherAnnouncementsPage() {
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [announcements, setAnnouncements] = useState([])
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sortOldestFirst, setSortOldestFirst] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const list = await fetchTeacherAnnouncements()
        if (!cancelled) {
          setAnnouncements(list)
          setFromCache(!isOnline())
        }
      } catch (e) {
        if (!cancelled) {
          setAnnouncements([])
          toastRef.current.error(FACULTY_MSG.announcements.loadFailed, {
            toastId: FACULTY_TOAST_ID.announcementsFetchError,
            durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
          })
        }
        console.error('[TeacherAnnouncementsPage]', e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = announcements.filter((item) => {
      if (!q) return true
      return String(item.title || '').toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      const ta = new Date(a.postedAt || 0).getTime()
      const tb = new Date(b.postedAt || 0).getTime()
      return sortOldestFirst ? ta - tb : tb - ta
    })
    return list
  }, [announcements, query, sortOldestFirst])

  const handleDownload = async (item) => {
    toast.success(FACULTY_MSG.announcements.downloading, {
      toastId: FACULTY_TOAST_ID.announcementDownload,
      durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
    })
    const ok = await downloadAnnouncementImage(item)
    if (!ok) console.warn('[TeacherAnnouncementsPage] download failed for', item.id)
  }

  return (
    <>
      <TeacherMainHeader pageTitle="Announcements" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <TeacherBackButton to="/teacher/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Announcement list</h2>
          </div>
          <button
            type="button"
            className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() => navigate('/teacher/announcements/new')}
          >
            + Add announcement
          </button>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
            <input
              type="search"
              placeholder="Search announcements by title..."
              className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setSortOldestFirst((v) => !v)}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
          >
            <CalendarIcon className="h-4 w-4 text-neutral-500" />
            {sortOldestFirst ? 'Sort by Oldest' : 'Sort by Newest'}
          </button>
        </div>

        {loading ? (
          <p className="py-12 text-center text-sm text-neutral-500">Loading announcements…</p>
        ) : filteredSorted.length === 0 ? (
          <p className="rounded-xl border border-neutral-200 bg-white py-12 text-center text-sm font-medium text-neutral-500 shadow-sm">
            No announcements yet.
          </p>
        ) : (
          <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {filteredSorted.map((item) => {
              const imageSrc = resolveAnnouncementImageSrc(item)
              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md"
                >
                  <div className="relative aspect-video w-full bg-neutral-100">
                    {imageSrc ? (
                      <AuthenticatedImage
                        src={imageSrc}
                        alt=""
                        className="h-full w-full object-cover"
                        fallback={
                          <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                            No image
                          </div>
                        }
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-neutral-400">
                        No image
                      </div>
                    )}
                    <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 shadow-sm">
                      {item.updateType || '—'}
                    </span>
                  </div>
                  <div className="border-b border-neutral-100 px-4 py-2 text-xs font-medium text-neutral-600">
                    Date Posted: {formatDatePosted(item.postedAt)}
                  </div>
                  <div className="px-4 py-3">
                    <h3 className="line-clamp-2 text-base font-bold uppercase text-neutral-900">
                      {item.title}
                    </h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cardActionClass}
                        onClick={() => navigate(`/teacher/announcements/${item.id}`)}
                      >
                        <i className="ti ti-eye text-sm" aria-hidden="true" />
                        View
                      </button>
                      <button
                        type="button"
                        className={cardActionClass}
                        onClick={() => navigate(`/teacher/announcements/${item.id}/edit`)}
                      >
                        <i className="ti ti-edit text-sm" aria-hidden="true" />
                        Edit
                      </button>
                      <button
                        type="button"
                        className={cardActionClass}
                        onClick={() => void handleDownload(item)}
                      >
                        <i className="ti ti-download text-sm" aria-hidden="true" />
                        Download
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </main>
    </>
  )
}
