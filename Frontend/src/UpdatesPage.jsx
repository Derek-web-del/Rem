import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import BackButton from './components/BackButton.jsx'
import AuthenticatedImage from './components/AuthenticatedImage.jsx'
import { resolveAnnouncementImageSrc } from './lib/teacherAnnouncements.js'
import UpdateDetails from './UpdateDetails.jsx'
import UpdateView from './UpdateView.jsx'

function SearchIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  )
}

function CalendarIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  )
}

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

function formatPosted(iso, label) {
  if (label) return label
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

export default function UpdatesPage({ updates, uploadedByLabel, onAddUpdate, onUpdateUpdate, onDeleteUpdate, onBack }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [sortOldestFirst, setSortOldestFirst] = useState(true)
  const [screen, setScreen] = useState('list')
  const [mode, setMode] = useState('add')
  const [activeId, setActiveId] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')

  const activeUpdate = useMemo(() => updates.find((u) => u.id === activeId) || null, [updates, activeId])

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase()
    let list = updates.filter((u) => {
      if (!q) return true
      return String(u.title || '').toLowerCase().includes(q)
    })
    list = [...list].sort((a, b) => {
      const ta = new Date(a.postedAt || 0).getTime()
      const tb = new Date(b.postedAt || 0).getTime()
      return sortOldestFirst ? ta - tb : tb - ta
    })
    return list
  }, [updates, query, sortOldestFirst])

  function openAdd() {
    setMode('add')
    setActiveId('')
    setScreen('details')
  }

  function openEdit(u) {
    setMode('edit')
    setActiveId(u.id)
    setScreen('details')
  }

  function openView(u) {
    setActiveId(u.id)
    setScreen('view')
  }

  if (screen === 'details') {
    const initial =
      mode === 'edit' && activeUpdate
        ? activeUpdate
        : { title: '', updateType: '', description: '', imageDataUrl: '' }

    return (
      <UpdateDetails
        mode={mode}
        initial={initial}
        onBack={() => setScreen('list')}
        onSave={async (payload) => {
          if (mode === 'edit' && activeUpdate) {
            const r = await Promise.resolve(onUpdateUpdate(activeUpdate.id, payload))
            if (r?.error) return r
            setScreen('list')
            return { ok: true }
          }
          const r = await Promise.resolve(onAddUpdate(payload))
          if (r?.error) return r
          setScreen('list')
          return { ok: true }
        }}
      />
    )
  }

  if (screen === 'view') {
    return (
      <UpdateView
        updateItem={activeUpdate}
        uploadedByLabel={uploadedByLabel}
        onBack={() => setScreen('list')}
        onEdit={() => {
          if (!activeUpdate) return
          setMode('edit')
          setScreen('details')
        }}
      />
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <BackButton onClick={() => navigate(-1)} />
          <h2 className="mt-1 text-3xl font-bold text-neutral-900">Announcements</h2>
        </div>
        <button
          type="button"
          className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:brightness-110"
          onClick={openAdd}
        >
          + Add Announcement
        </button>
      </div>

      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Search announcements by title..."
            className="w-full rounded-lg border border-neutral-200 bg-white py-2.5 pl-10 pr-4 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => setSortOldestFirst((v) => !v)}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
        >
          <CalendarIcon className="h-4 w-4 text-neutral-500" />
          {sortOldestFirst ? 'Sort by Oldest' : 'Sort by Newest'}
        </button>
      </div>

      <div className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-semibold text-neutral-800 shadow-sm">
        <span>All Announcements</span>
        <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs text-white tabular-nums">{updates.length}</span>
      </div>

      <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        {filteredSorted.length === 0 ? (
          <p className="col-span-full rounded-xl border border-neutral-200 bg-white py-12 text-center text-sm font-medium text-neutral-500 shadow-sm">
            No announcements yet.
          </p>
        ) : (
          filteredSorted.map((u) => {
            const imageSrc = resolveAnnouncementImageSrc(u)
            return (
            <article key={u.id} className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-md">
              <div className="aspect-video w-full bg-neutral-100">
                {imageSrc ? (
                  <AuthenticatedImage src={imageSrc} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-sm text-neutral-400">No image</div>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 border-b border-neutral-100 px-4 py-2 text-xs font-medium text-neutral-600">
                <span>{formatPosted(u.postedAt, u.postedAtLabel)}</span>
                <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-neutral-700">{u.updateType}</span>
              </div>
              <div className="px-4 py-3">
                <h3 className="line-clamp-2 text-base font-bold text-neutral-900">{u.title}</h3>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded border border-blue-500 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50"
                    onClick={() => openView(u)}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    className="rounded border border-amber-400 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
                    onClick={() => openEdit(u)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="rounded border border-emerald-500 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-50"
                    onClick={() => downloadUpdateImage(u.imageDataUrl, u.title)}
                  >
                    Download
                  </button>
                  <button
                    type="button"
                    className="rounded border border-red-500 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50"
                    onClick={() => setDeleteTarget(u)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </article>
            )
          })
        )}
      </div>

      {deleteTarget ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-neutral-900">Delete update</h3>
            <p className="mt-2 text-sm text-neutral-700">
              Are you sure you want to delete <span className="font-semibold">{deleteTarget.title}</span>? This cannot be undone.
            </p>
            {deleteError ? <p className="mt-2 text-sm font-medium text-red-700">{deleteError}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg bg-neutral-200 px-4 py-2 text-sm font-semibold text-neutral-700 hover:bg-neutral-300"
                onClick={() => {
                  setDeleteTarget(null)
                  setDeleteError('')
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
                onClick={async () => {
                  setDeleting(true)
                  setDeleteError('')
                  try {
                    const r = await Promise.resolve(onDeleteUpdate(deleteTarget.id))
                    if (r?.error) {
                      setDeleteError(r.error)
                      return
                    }
                    setDeleteTarget(null)
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

