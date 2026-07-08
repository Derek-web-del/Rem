import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import {
  downloadAnnouncementImage,
  resolveAnnouncementImageSrc,
} from '../../lib/teacherAnnouncements.js'
import { fetchStudentAnnouncements } from '../../lib/studentPortal.js'
import { isOnline } from '../../lib/offlineSync.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import AuthenticatedImage from '../../components/AuthenticatedImage.jsx'
import StudentMainHeader from './StudentMainHeader.jsx'
import StudentViewHeader from './StudentViewHeader.jsx'

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

function formatPostedLong(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function StudentAnnouncementsPage() {
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)
  const [query, setQuery] = useState('')
  const [sortOldestFirst, setSortOldestFirst] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const offline = !isOnline()
        const list = await fetchStudentAnnouncements()
        if (!cancelled) {
          setRows(list)
          setFromCache(offline)
        }
      } catch (e) {
        if (!cancelled) setRows([])
        console.error('[StudentAnnouncementsPage]', e)
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
    let list = rows.filter((item) => {
      if (!q) return true
      return String(item.title || '').toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      const ta = new Date(a.postedAt || 0).getTime()
      const tb = new Date(b.postedAt || 0).getTime()
      return sortOldestFirst ? ta - tb : tb - ta
    })
    return list
  }, [rows, query, sortOldestFirst])

  const handleDownload = async (item) => {
    const ok = await downloadAnnouncementImage(item)
    if (!ok) console.warn('[StudentAnnouncementsPage] download failed for', item.id)
  }

  return (
    <>
      <StudentMainHeader pageTitle="Announcements" />
      <main className="min-h-0 flex-1 space-y-6 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <StudentViewHeader title="Announcements" backTo="/student/dashboard" />
        <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

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
            {!isOnline()
              ? 'No offline announcements yet. Connect to the internet and open the dashboard once to sync.'
              : 'No announcements posted yet.'}
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
                  <div className="aspect-video w-full bg-neutral-100">
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
                  </div>
                  <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2 text-xs font-medium text-neutral-600">
                    <span>{formatPostedLong(item.postedAt)}</span>
                    <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">
                      {item.updateType || '—'}
                    </span>
                  </div>
                  <div className="px-4 py-3">
                    <h3 className="line-clamp-2 text-base font-bold text-neutral-900">{item.title}</h3>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="rounded border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                        onClick={() => navigate(`/student/announcements/${encodeURIComponent(String(item.id))}`)}
                      >
                        View
                      </button>
                      <button
                        type="button"
                        className="rounded border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                        onClick={() => void handleDownload(item)}
                      >
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
