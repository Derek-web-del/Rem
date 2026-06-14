export default function OfflineCacheIndicator({ fromCache, className = '' }) {
  if (!fromCache) return null
  return (
    <div
      className={`flex items-center gap-1.5 text-[11px] text-neutral-500 ${className}`}
      role="status"
    >
      <i className="ti ti-clock" aria-hidden="true" />
      <span>Showing cached data — refresh to update</span>
    </div>
  )
}
