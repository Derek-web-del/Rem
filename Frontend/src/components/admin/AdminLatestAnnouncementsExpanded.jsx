import { useState } from 'react'
import { resolveAnnouncementImageSrc } from '../../lib/teacherAnnouncements.js'

function BellIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  )
}

function AnnouncementImage({ item }) {
  const [imgFailed, setImgFailed] = useState(false)
  const imageSrc = resolveAnnouncementImageSrc(item)
  if (imageSrc && !imgFailed) {
    return (
      <img
        src={imageSrc}
        alt={item.title || 'Announcement'}
        className="h-full w-full object-cover"
        onError={() => setImgFailed(true)}
      />
    )
  }
  return (
    <div className="flex h-full items-center justify-center text-sm font-medium text-neutral-400">
      No preview
    </div>
  )
}

function formatAnnouncementDateTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/**
 * @param {{
 *   announcements: Array<{ id: string, title?: string, imageDataUrl?: string, imagePath?: string, updateType?: string, uploadedBy?: string, postedAt?: string }>,
 *   onViewAll?: () => void,
 * }} props
 */
export default function AdminLatestAnnouncementsExpanded({ announcements = [], onViewAll }) {
  const items = announcements.slice(0, 5)

  return (
    <section className="min-h-[200px] rounded-xl border border-neutral-100 bg-white shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 px-5 py-4 md:px-6">
        <h3 className="text-lg font-bold text-neutral-900">Latest Announcements</h3>
        <button
          type="button"
          onClick={onViewAll}
          className="rounded-lg border border-[#1e4fa3]/30 bg-[#1e4fa3]/5 px-4 py-1.5 text-sm font-semibold text-[#1e4fa3] transition hover:bg-[#1e4fa3]/10"
        >
          View All
        </button>
      </div>

      <div className="p-5 md:p-6">
        {items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-neutral-100 text-neutral-400">
              <BellIcon className="h-7 w-7" />
            </div>
            <p className="mt-4 text-sm font-medium text-neutral-500">No announcements yet.</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {items.map((item) => (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-xl border border-neutral-200 border-l-4 border-l-[#1e4fa3] bg-white shadow-sm transition hover:shadow-md"
                >
                  <div className="relative aspect-video w-full bg-neutral-100">
                    <AnnouncementImage item={item} />
                    {item.updateType ? (
                      <span className="absolute right-2 top-2 rounded-full bg-white/95 px-2.5 py-0.5 text-[11px] font-semibold text-neutral-700 shadow-sm">
                        {item.updateType}
                      </span>
                    ) : null}
                  </div>
                  <div className="p-4">
                    <h4 className="text-lg font-bold text-neutral-900">{item.title || 'Untitled'}</h4>
                    <dl className="mt-3 space-y-1.5 text-xs text-neutral-500">
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold text-neutral-600">Posted by:</dt>
                        <dd>{item.uploadedBy || 'Institute'}</dd>
                      </div>
                      <div className="flex flex-wrap gap-x-2">
                        <dt className="font-semibold text-neutral-600">Date:</dt>
                        <dd>{formatAnnouncementDateTime(item.postedAt)}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}
