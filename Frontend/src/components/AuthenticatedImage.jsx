import { useEffect, useState } from 'react'
import { fetchAuthenticatedMediaUrl, isDirectMediaUrl } from '../lib/authenticatedMedia.js'

/**
 * Renders images from data URLs, public URLs, or cookie-protected /api/files paths.
 */
export default function AuthenticatedImage({
  src,
  alt = '',
  className = '',
  fallback = null,
  ...props
}) {
  const [displaySrc, setDisplaySrc] = useState('')
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function load() {
      setFailed(false)
      setDisplaySrc('')

      const raw = String(src || '').trim()
      if (!raw) {
        setFailed(true)
        return
      }

      if (isDirectMediaUrl(raw)) {
        setDisplaySrc(raw)
        return
      }

      try {
        const url = await fetchAuthenticatedMediaUrl(raw)
        if (cancelled) return
        if (url.startsWith('blob:')) objectUrl = url
        setDisplaySrc(url)
      } catch {
        if (!cancelled) setFailed(true)
      }
    }

    void load()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [src])

  if (!displaySrc || failed) {
    return fallback
  }

  return <img src={displaySrc} alt={alt} className={className} {...props} />
}
