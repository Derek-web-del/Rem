import { useEffect, useMemo, useState } from 'react'
import AuthenticatedImage from './AuthenticatedImage.jsx'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { subjectImageDisplaySrc, subjectImagePlaceholderSrc } from '../lib/subjectImages.js'

function isProtectedSubjectImageSrc(src) {
  const t = String(src || '').trim()
  return t.includes('/api/files/') || t.includes('/uploads/')
}

/**
 * Subject cover image with automatic fallback to placeholder on load failure.
 */
export default function SubjectCoverImage({ subject, subjectName, className, alt = 'Subject' }) {
  const target = subject ?? subjectName ?? ''
  const primary = subjectImageDisplaySrc(target, { apiUrlFn: apiUrl })
  const placeholder = subjectImagePlaceholderSrc({ apiUrlFn: apiUrl })
  const [failed, setFailed] = useState(false)
  const useAuth = useMemo(() => isProtectedSubjectImageSrc(primary), [primary])

  useEffect(() => {
    setFailed(false)
  }, [primary])

  const displaySrc = failed ? placeholder : primary

  if (useAuth && !failed) {
    return (
      <AuthenticatedImage
        src={displaySrc}
        alt={alt}
        className={className}
        fallback={
          <img
            src={placeholder}
            alt={alt}
            className={className}
          />
        }
      />
    )
  }

  return (
    <img
      src={displaySrc}
      alt={alt}
      className={className}
      onError={() => {
        if (!failed) setFailed(true)
      }}
    />
  )
}
