import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'

const GRADE_LEVELS = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12']

function formatDate(raw) {
  if (!raw) return '—'
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toISOString().slice(0, 10)
}

/** Admin panel: upload PDF curriculum guides and publish to faculty dashboard. */
export default function AdminCurriculumGuidesPage() {
  const toast = useNotify()
  const [guides, setGuides] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    title: '',
    grade_level: '',
    subject: '',
    publish: true,
    file: null,
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(apiUrl('/api/admin/curriculum-guides'), { credentials: 'include' })
      const data = await res.json().catch(() => [])
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to load guides.')
      setGuides(Array.isArray(data) ? data : [])
    } catch (e) {
      toast.error(String(e?.message || e))
      setGuides([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  async function handleUpload(e) {
    e.preventDefault()
    if (!form.file) {
      toast.error('Choose a PDF file.')
      return
    }
    if (!form.title.trim() || !form.grade_level || !form.subject.trim()) {
      toast.error('Title, grade level, and subject are required.')
      return
    }
    setBusy(true)
    try {
      const body = new FormData()
      body.append('file', form.file)
      body.append('title', form.title.trim())
      body.append('grade_level', form.grade_level)
      body.append('subject', form.subject.trim())
      body.append('is_published', form.publish ? 'true' : 'false')
      const res = await fetch(apiUrl('/api/admin/curriculum-guides'), {
        method: 'POST',
        credentials: 'include',
        body,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Upload failed.')
      toast.created('Curriculum guide uploaded.')
      setForm({ title: '', grade_level: '', subject: '', publish: true, file: null })
      await load()
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  async function togglePublish(guide) {
    setBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/curriculum-guides/${encodeURIComponent(guide.id)}`), {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_published: !guide.is_published }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Update failed.')
      await load()
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  async function removeGuide(guide) {
    if (!window.confirm(`Delete "${guide.title}"?`)) return
    setBusy(true)
    try {
      const res = await fetch(apiUrl(`/api/admin/curriculum-guides/${encodeURIComponent(guide.id)}`), {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.message || data?.error || 'Delete failed.')
      toast.deleted('Curriculum guide removed.')
      await load()
    } catch (err) {
      toast.error(String(err?.message || err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mt-8 space-y-6 rounded-xl border border-neutral-200 bg-white p-5 shadow-md md:p-6">
      <div>
        <h3 className="text-lg font-bold text-neutral-900">Faculty curriculum (PostgreSQL)</h3>
        <p className="mt-1 text-sm text-neutral-600">
          Upload PDF guides here to publish them on the teacher Curriculum page. Guides synced from the dashboard
          above remain read-only in this table.
        </p>
      </div>

      <form className="grid gap-3 md:grid-cols-2" onSubmit={(e) => void handleUpload(e)}>
        <input
          className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
          placeholder="Title (e.g. ENGLISH 7 CURRICULUM)"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        />
        <select
          className="rounded-lg border px-3 py-2 text-sm"
          value={form.grade_level}
          onChange={(e) => setForm((f) => ({ ...f, grade_level: e.target.value }))}
        >
          <option value="">Grade level</option>
          {GRADE_LEVELS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <input
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="Subject"
          value={form.subject}
          onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
        />
        <input
          type="file"
          accept="application/pdf,.pdf"
          className="rounded-lg border px-3 py-2 text-sm md:col-span-2"
          onChange={(e) => setForm((f) => ({ ...f, file: e.target.files?.[0] || null }))}
        />
        <label className="flex items-center gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            checked={form.publish}
            onChange={(e) => setForm((f) => ({ ...f, publish: e.target.checked }))}
          />
          Publish immediately for faculty
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Uploading…' : 'Upload PDF guide'}
        </button>
      </form>

      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b text-xs uppercase tracking-wide text-neutral-500">
              <th className="px-2 py-2">Title</th>
              <th className="px-2 py-2">Grade</th>
              <th className="px-2 py-2">Subject</th>
              <th className="px-2 py-2">Source</th>
              <th className="px-2 py-2">Published</th>
              <th className="px-2 py-2">Uploaded</th>
              <th className="px-2 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-neutral-500">
                  Loading…
                </td>
              </tr>
            ) : guides.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-2 py-6 text-center text-neutral-500">
                  No guides in database yet.
                </td>
              </tr>
            ) : (
              guides.map((g) => (
                <tr key={g.id} className="border-b border-neutral-100">
                  <td className="px-2 py-2 font-medium text-neutral-900">{g.title}</td>
                  <td className="px-2 py-2">{g.grade_level || '—'}</td>
                  <td className="px-2 py-2">{g.subject || '—'}</td>
                  <td className="px-2 py-2 text-xs text-neutral-500">{g.source || '—'}</td>
                  <td className="px-2 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        g.is_published ? 'bg-emerald-100 text-emerald-800' : 'bg-neutral-200 text-neutral-700'
                      }`}
                    >
                      {g.is_published ? 'Published' : 'Draft'}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-xs text-neutral-500">{formatDate(g.created_at)}</td>
                  <td className="px-2 py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busy || g.source === 'app_state'}
                        className="rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void togglePublish(g)}
                        title={
                          g.source === 'app_state'
                            ? 'Synced guides are always published via dashboard'
                            : undefined
                        }
                      >
                        {g.is_published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        type="button"
                        disabled={busy || g.source === 'app_state'}
                        className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white disabled:opacity-50"
                        onClick={() => void removeGuide(g)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )
}
