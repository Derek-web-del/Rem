import { useEffect, useState } from 'react'
import { fetchStudentSubjectMaterials, StudentApiError } from '../../lib/studentPortal.js'
import { cachePdfOnView, isPdfCached } from '../../lib/pdfCacheStatus.js'
import PdfViewerModal from '../../components/PdfViewerModal.jsx'
import PdfOfflineBadge from '../../components/PdfOfflineBadge.jsx'

export default function StudentSubjectMaterialsTab({ subjectId }) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [viewer, setViewer] = useState(null)
  const [cachedPaths, setCachedPaths] = useState(() => new Set())

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const list = await fetchStudentSubjectMaterials(subjectId)
        if (!cancelled) setMaterials(Array.isArray(list) ? list : [])
      } catch (e) {
        if (!cancelled) {
          setMaterials([])
          setError(
            e instanceof StudentApiError
              ? String(e.message || 'Could not load materials.')
              : 'Could not load materials.',
          )
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [subjectId])

  useEffect(() => {
    let cancelled = false
    async function refreshCacheFlags() {
      const paths = materials
        .map((item) => String(item?.file_path ?? item?.file_url ?? item?.filePath ?? '').trim())
        .filter(Boolean)
      const hits = new Set()
      await Promise.all(
        paths.map(async (path) => {
          if (await isPdfCached(path)) hits.add(path)
        }),
      )
      if (!cancelled) setCachedPaths(hits)
    }
    if (materials.length) void refreshCacheFlags()
    return () => {
      cancelled = true
    }
  }, [materials])

  async function openMaterial(item) {
    const rawPath = String(item?.file_path ?? item?.file_url ?? item?.filePath ?? '').trim()
    if (!rawPath) return
    void cachePdfOnView(rawPath)
    setViewer({
      fileUrl: rawPath,
      fileName: String(item?.title ?? item?.file_name ?? 'Material').trim() || 'Material',
    })
  }

  if (loading) return <p className="p-4 text-sm text-neutral-500">Loading materials…</p>
  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>
  if (!materials.length) {
    return <p className="p-4 text-sm text-neutral-500">No materials uploaded for this subject yet.</p>
  }

  return (
    <>
      <ul className="divide-y divide-neutral-100 p-4">
        {materials.map((item) => {
          const id = String(item?.id ?? '')
          const title = String(item?.title ?? item?.file_name ?? 'Material').trim()
          const rawPath = String(item?.file_path ?? item?.file_url ?? item?.filePath ?? '').trim()
          const isCached = rawPath ? cachedPaths.has(rawPath) : false
          return (
            <li key={id || title} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-neutral-900">{title}</p>
                {item?.description ? (
                  <p className="mt-0.5 truncate text-xs text-neutral-500">{item.description}</p>
                ) : null}
                {isCached ? (
                  <div className="mt-1">
                    <PdfOfflineBadge />
                  </div>
                ) : null}
              </div>
              {rawPath ? (
                <button
                  type="button"
                  onClick={() => void openMaterial(item)}
                  className="shrink-0 rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
                >
                  View
                </button>
              ) : null}
            </li>
          )
        })}
      </ul>
      {viewer ? (
        <PdfViewerModal
          fileUrl={viewer.fileUrl}
          fileName={viewer.fileName}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </>
  )
}
