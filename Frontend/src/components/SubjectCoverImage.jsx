import { useEffect, useState } from 'react'
import { apiUrl } from '../lib/lmsStateStorage.js'
import { subjectImageDisplaySrc, subjectImagePlaceholderSrc } from '../lib/subjectImages.js'

/**
 * Subject cover image with automatic fallback to placeholder on load failure.
 */
export default function SubjectCoverImage({ subject, subjectName, className, alt = 'Subject' }) {
  const target = subject ?? subjectName ?? ''
  const primary = subjectImageDisplaySrc(target, { apiUrlFn: apiUrl })
  const placeholder = subjectImagePlaceholderSrc({ apiUrlFn: apiUrl })
  const [src, setSrc] = useState(primary)

  useEffect(() => {
    setSrc(primary)
  }, [primary])

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => {
        if (src !== placeholder) setSrc(placeholder)
      }}
    />
  )
}
