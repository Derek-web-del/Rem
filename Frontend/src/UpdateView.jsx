import BackButton from './components/BackButton.jsx'

function downloadUpdateImage(imageDataUrl, baseName) {
  if (!imageDataUrl || !String(imageDataUrl).startsWith('data:')) return
  const mime = imageDataUrl.split(';')[0]?.replace('data:', '') || 'image/jpeg'
  const ext = mime.includes('png') ? 'png' : 'jpg'
  const safe = String(baseName || 'update')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 80) || 'update'
  const a = document.createElement('a')
  a.href = imageDataUrl
  a.download = `${safe}.${ext}`
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export default function UpdateView({ updateItem, uploadedByLabel, onBack, onEdit }) {
  if (!updateItem) {
    return (
      <div className="space-y-4">
        <BackButton onClick={onBack} />
        <p className="text-sm text-neutral-600">Announcement not found.</p>
      </div>
    )
  }

  const posted = updateItem.postedAt ? new Date(updateItem.postedAt) : null
  const dateStr =
    posted && !Number.isNaN(posted.getTime())
      ? posted.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' })
      : '—'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold text-neutral-900">Announcement</h2>
          <p className="mt-1 text-sm text-neutral-500">{dateStr}</p>
        </div>
        <BackButton onClick={onBack} />
      </div>

      <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
        <h3 className="text-sm font-bold text-neutral-600">Name Info:</h3>
        <div className="mt-4 space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Title</p>
            <p className="mt-1 text-lg font-semibold text-neutral-900">{updateItem.title}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Message</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-800">{updateItem.description}</p>
          </div>
          <div className="grid gap-4 border-t border-neutral-100 pt-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Uploaded By</p>
              <p className="mt-1 text-sm font-medium text-neutral-800">{updateItem.uploadedBy || uploadedByLabel || 'Institute'}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Announcement Type</p>
              <p className="mt-1 text-sm font-medium text-neutral-800">{updateItem.updateType}</p>
            </div>
          </div>
        </div>
      </section>

      {updateItem.imageDataUrl ? (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
          <img src={updateItem.imageDataUrl} alt="" className="max-h-[480px] w-full object-contain bg-neutral-50" />
          <div className="border-t border-neutral-100 p-4">
            <button
              type="button"
              onClick={() => downloadUpdateImage(updateItem.imageDataUrl, updateItem.title)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:brightness-110"
            >
              Download
            </button>
            {onEdit ? (
              <button
                type="button"
                onClick={onEdit}
                className="ml-2 rounded-lg border border-amber-400 bg-amber-50 px-4 py-2 text-sm font-semibold text-neutral-900 hover:bg-amber-100"
              >
                Edit
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        <p className="text-sm text-neutral-500">No image attached.</p>
      )}
    </div>
  )
}
