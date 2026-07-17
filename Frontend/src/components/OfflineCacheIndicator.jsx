/** Formats a past timestamp as a short relative string, e.g. "5 minutes ago". */
function formatRelativeTime(cachedAt) {
  const ts = Number(cachedAt)
  if (!Number.isFinite(ts) || ts <= 0) return null

  const diffMs = Date.now() - ts
  if (diffMs < 0) return 'just now'

  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour

  if (diffMs < minute) return 'just now'
  if (diffMs < hour) {
    const mins = Math.floor(diffMs / minute)
    return `${mins} minute${mins === 1 ? '' : 's'} ago`
  }
  if (diffMs < day) {
    const hours = Math.floor(diffMs / hour)
    return `${hours} hour${hours === 1 ? '' : 's'} ago`
  }
  const days = Math.floor(diffMs / day)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

/**
 * Shown whenever a list/detail view is displaying IndexedDB-cached data
 * instead of a fresh server response (e.g. while offline).
 * @param {{ fromCache?: boolean, cachedAt?: number|null, className?: string }} props
 */
export default function OfflineCacheIndicator({ fromCache, cachedAt, className = '' }) {
  if (!fromCache) return null
  const relative = formatRelativeTime(cachedAt)
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] text-neutral-500 ${className}`}
      role="status"
    >
      <i className="ti ti-clock" aria-hidden="true" />
      <span>
        {relative
          ? `Showing cached data from ${relative} — refresh to update`
          : 'Showing cached data — refresh to update'}
      </span>
    </div>
  )
}
