import { useCallback, useEffect, useRef, useState } from 'react'
import BackButton from './components/BackButton.jsx'
import { PROFILE_PHOTO_MAX_BYTES, PROFILE_PHOTO_MAX_MSG, PHOTO_UPLOAD_LABEL } from './lib/uploadLimits.js'

const UPDATE_TYPES = ['Institute', 'Campus', 'Announcement', 'Event', 'News']

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '')
    reader.onerror = () => reject(new Error('Could not read file.'))
    reader.readAsDataURL(file)
  })
}

function FolderIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z" />
    </svg>
  )
}

export default function UpdateDetails({
  mode,
  initial,
  onBack,
  onSave,
  submitLabel,
  subheading = 'ADD NEW',
}) {
  const fileInputRef = useRef(null)
  const dropRef = useRef(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [imageFileName, setImageFileName] = useState('')
  const [form, setForm] = useState(() => ({
    title: initial.title || '',
    updateType: initial.updateType || '',
    description: initial.description || '',
    imageDataUrl: initial.imageDataUrl || '',
  }))

  useEffect(() => {
    setForm({
      title: initial.title || '',
      updateType: initial.updateType || '',
      description: initial.description || '',
      imageDataUrl: initial.imageDataUrl || '',
    })
    setImageFileName(initial.imageName || initial.image_name || '')
    setError('')
  }, [initial])

  const handleImageFile = useCallback(async (file) => {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      setError('Only PNG or JPG images are allowed.')
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      setError(PROFILE_PHOTO_MAX_MSG)
      return
    }
    setError('')
    const dataUrl = await readFileAsDataUrl(file)
    setImageFileName(file.name)
    setForm((prev) => ({ ...prev, imageDataUrl: dataUrl }))
  }, [])

  function validate() {
    if (!String(form.title || '').trim()) return 'Announcement title is required.'
    if (!String(form.updateType || '').trim()) return 'Please select announcement type.'
    if (!String(form.description || '').trim()) return 'Announcement message is required.'
    return ''
  }

  async function submit(e) {
    e.preventDefault()
    const msg = validate()
    if (msg) {
      setError(msg)
      return
    }
    setError('')
    setSubmitting(true)
    try {
      const res = await Promise.resolve(
        onSave({
          title: String(form.title).trim(),
          updateType: String(form.updateType).trim(),
          description: String(form.description).trim(),
          imageDataUrl: form.imageDataUrl || '',
          imageName: imageFileName || '',
        }),
      )
      if (res && typeof res === 'object' && res.error) setError(res.error)
    } finally {
      setSubmitting(false)
    }
  }

  useEffect(() => {
    const el = dropRef.current
    if (!el) return
    function prevent(e) {
      e.preventDefault()
      e.stopPropagation()
    }
    function onDrop(e) {
      prevent(e)
      const file = e.dataTransfer?.files?.[0]
      handleImageFile(file)
    }
    el.addEventListener('dragenter', prevent)
    el.addEventListener('dragover', prevent)
    el.addEventListener('dragleave', prevent)
    el.addEventListener('drop', onDrop)
    return () => {
      el.removeEventListener('dragenter', prevent)
      el.removeEventListener('dragover', prevent)
      el.removeEventListener('dragleave', prevent)
      el.removeEventListener('drop', onDrop)
    }
  }, [handleImageFile])

  const label = submitLabel || (mode === 'edit' ? 'Save Changes' : 'Add Announcement')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {mode === 'add' ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-sky-600">{subheading}</p>
          ) : null}
          <h2 className="mt-0.5 text-3xl font-bold text-[#15397a]">Announcement</h2>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <div className="flex flex-col gap-4 rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:flex-row md:items-center md:p-6">
        <div className="flex shrink-0 items-center gap-4">
          {form.imageDataUrl ? (
            <img src={form.imageDataUrl} alt="" className="h-24 w-24 rounded-lg border border-neutral-200 object-cover" />
          ) : (
            <div className="flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-neutral-300 bg-neutral-50 text-xs text-neutral-400">
              No image
            </div>
          )}
          <div>
            <p className="font-semibold text-neutral-900">Announcement Image</p>
            <p className="mt-1 text-sm text-neutral-500">{PHOTO_UPLOAD_LABEL}</p>
          </div>
        </div>
        <div
          ref={dropRef}
          className="flex min-h-[120px] flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 bg-neutral-50/80 px-4 py-6 text-center"
        >
          <FolderIcon className="h-10 w-10 text-amber-400" />
          <p className="mt-2 text-sm text-neutral-600">
            Drag &amp; drop your photo here or{' '}
            <button
              type="button"
              className="font-semibold text-blue-600 underline-offset-2 hover:underline"
              onClick={() => fileInputRef.current?.click()}
            >
              browse
            </button>
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/jpg"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              e.target.value = ''
              handleImageFile(f)
            }}
          />
        </div>
      </div>

      <form onSubmit={submit} className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block text-sm font-medium text-neutral-700">
            <span className="text-red-600">*</span> Announcement Title
            <input
              type="text"
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={form.title}
              onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
              placeholder="Title"
            />
          </label>
          <label className="block text-sm font-medium text-neutral-700">
            <span className="text-red-600">*</span> Announcement Type
            <select
              className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              value={form.updateType}
              onChange={(e) => setForm((p) => ({ ...p, updateType: e.target.value }))}
            >
              <option value="">Select Type</option>
              {UPDATE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium text-neutral-700">
          <span className="text-red-600">*</span> Message
          <textarea
            rows={6}
            className="mt-1 w-full resize-y rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={form.description}
            onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
            placeholder="Message"
          />
        </label>

        {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

        <div className="flex justify-end pt-2">
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? 'Saving…' : label}
          </button>
        </div>
      </form>
    </div>
  )
}
