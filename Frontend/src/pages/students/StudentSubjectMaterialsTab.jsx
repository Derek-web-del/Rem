import { useEffect, useState } from 'react'
import { fetchStudentSubjectMaterials, StudentApiError } from '../../lib/studentPortal.js'
import { uploadsPathToApiUrl } from '../../lib/fileUrls.js'

export default function StudentSubjectMaterialsTab({ subjectId }) {
  const [materials, setMaterials] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

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

  if (loading) return <p className="p-4 text-sm text-neutral-500">Loading materials…</p>
  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>
  if (!materials.length) {
    return <p className="p-4 text-sm text-neutral-500">No materials uploaded for this subject yet.</p>
  }

  return (
    <ul className="divide-y divide-neutral-100 p-4">
      {materials.map((item) => {
        const id = String(item?.id ?? '')
        const title = String(item?.title ?? item?.file_name ?? 'Material').trim()
        const fileUrl = uploadsPathToApiUrl(item?.file_path ?? item?.file_url ?? item?.filePath ?? '')
        return (
          <li key={id || title} className="flex items-center justify-between gap-3 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-neutral-900">{title}</p>
              {item?.description ? (
                <p className="mt-0.5 truncate text-xs text-neutral-500">{item.description}</p>
              ) : null}
            </div>
            {fileUrl ? (
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded-lg bg-[#185FA5] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
              >
                Open
              </a>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}
