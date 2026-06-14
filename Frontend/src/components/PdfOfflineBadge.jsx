import { useEffect, useState } from 'react'
import { isPdfCached } from '../lib/pdfCacheStatus.js'

/**
 * Shows whether a study-material PDF is in the service-worker cache.
 * @param {{ fileUrl?: string|null, refreshKey?: number }} props
 */
export default function PdfOfflineBadge({ fileUrl, refreshKey = 0 }) {
  const [cached, setCached] = useState(null)

  useEffect(() => {
    let cancelled = false
    if (!fileUrl) {
      setCached(false)
      return undefined
    }
    isPdfCached(fileUrl).then((ok) => {
      if (!cancelled) setCached(ok)
    })
    return () => {
      cancelled = true
    }
  }, [fileUrl, refreshKey])

  if (cached === null) return null

  if (cached) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-800">
        <i className="ti ti-cloud-check text-xs" aria-hidden="true" />
        Available offline
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">
      <i className="ti ti-cloud-download text-xs" aria-hidden="true" />
      View to cache
    </span>
  )
}
