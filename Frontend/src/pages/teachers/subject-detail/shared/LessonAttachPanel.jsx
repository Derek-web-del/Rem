import { useRef, useState } from 'react'

const ACCEPT = '.pdf'
const ALLOWED = new Set(['pdf'])

function linkLabel(url) {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

export default function LessonAttachPanel({
  file,
  existingFileName,
  linkUrl,
  onFileChange,
  onLinkChange,
  onClearFile,
  onClearLink,
}) {
  const fileRef = useRef(null)
  const [linkDraft, setLinkDraft] = useState('')
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkError, setLinkError] = useState('')

  function validateFile(f) {
    if (!f) return ''
    const ext = f.name.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED.has(ext)) return 'Only PDF files are allowed.'
    return ''
  }

  function handleFilePick(e) {
    const f = e.target.files?.[0]
    if (!f) return
    const err = validateFile(f)
    if (err) {
      window.alert(err)
      e.target.value = ''
      return
    }
    onFileChange(f)
  }

  function handleAddLink() {
    const url = linkDraft.trim()
    if (!url) {
      setLinkError('Enter a URL.')
      return
    }
    if (!/^https?:\/\/.+/i.test(url)) {
      setLinkError('Link must start with http:// or https://')
      return
    }
    setLinkError('')
    onLinkChange(url)
    setLinkDraft('')
    setShowLinkInput(false)
  }

  const fileName = file?.name || existingFileName || null
  const hasFile = Boolean(file || existingFileName)
  const hasLink = Boolean(linkUrl)

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-5 shadow-sm">
      <p className="text-sm font-semibold text-neutral-900">Attach</p>
      <div className="mt-4 flex flex-wrap gap-6">
        <button
          type="button"
          className="flex flex-col items-center gap-2 text-neutral-600 hover:text-neutral-900"
          onClick={() => fileRef.current?.click()}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50">
            <i className="ti ti-upload text-xl" aria-hidden="true" />
          </span>
          <span className="text-xs">Upload</span>
        </button>
        <button
          type="button"
          className="flex flex-col items-center gap-2 text-neutral-600 hover:text-neutral-900"
          onClick={() => setShowLinkInput((v) => !v)}
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-full border border-neutral-200 bg-neutral-50">
            <i className="ti ti-link text-xl" aria-hidden="true" />
          </span>
          <span className="text-xs">Link</span>
        </button>
      </div>

      <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={handleFilePick} />

      {showLinkInput ? (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <input
            type="url"
            className="min-w-[200px] flex-1 rounded-md border border-neutral-300 px-3 py-2 text-sm"
            placeholder="https://"
            value={linkDraft}
            onChange={(e) => {
              setLinkDraft(e.target.value)
              setLinkError('')
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddLink()
            }}
          />
          <button type="button" className="rounded-md bg-[#185FA5] px-3 py-2 text-xs font-medium text-white" onClick={handleAddLink}>
            Add
          </button>
          <button type="button" className="text-xs text-neutral-500" onClick={() => setShowLinkInput(false)}>
            Cancel
          </button>
          {linkError ? <p className="w-full text-xs text-red-600">{linkError}</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {hasFile ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700">
            <i className="ti ti-paperclip" aria-hidden="true" />
            {fileName}
            <button type="button" className="text-neutral-400 hover:text-red-600" onClick={onClearFile} aria-label="Remove file">
              <i className="ti ti-x text-sm" aria-hidden="true" />
            </button>
          </span>
        ) : null}
        {hasLink ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-xs text-neutral-700">
            <i className="ti ti-link" aria-hidden="true" />
            {linkLabel(linkUrl)}
            <button type="button" className="text-neutral-400 hover:text-red-600" onClick={onClearLink} aria-label="Remove link">
              <i className="ti ti-x text-sm" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>
    </div>
  )
}
