import { useCallback, useEffect, useState } from 'react'
import apiFetch from '../../lib/apiClient.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import { PROFILE_PHOTO_MAX_BYTES, PHOTO_UPLOAD_LABEL } from '../../lib/uploadLimits.js'

export default function RegistrarAccountsPage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [registrars, setRegistrars] = useState([])
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
  const [profilePreview, setProfilePreview] = useState('')
  const [profileImageDataUrl, setProfileImageDataUrl] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(apiUrl('/api/v1/admin/registrars'))
      const data = await res.json().catch(() => ({}))
      setRegistrars(Array.isArray(data?.registrars) ? data.registrars : [])
    } catch (e) {
      toast.error(e?.message || 'Could not load registrar accounts.')
      setRegistrars([])
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void load()
  }, [load])

  function handlePhotoChange(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/jpg'].includes(file.type)) {
      toast.error('Please select a PNG or JPG image.')
      return
    }
    if (file.size > PROFILE_PHOTO_MAX_BYTES) {
      toast.error('Photo too large. Maximum size is 2MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : ''
      if (!result) return
      setProfilePreview(result)
      setProfileImageDataUrl(result)
    }
    reader.readAsDataURL(file)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const payload = {
        ...form,
        username: String(form.username || '').trim().toLowerCase(),
        email: String(form.email || '').trim().toLowerCase(),
        ...(profileImageDataUrl ? { profileImageDataUrl } : {}),
      }
      const res = await apiFetch(apiUrl('/api/v1/admin/registrars'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || 'Could not create registrar account.')
      }
      toast.success('Registrar account created.')
      setForm({ name: '', email: '', username: '', password: '' })
      setProfilePreview('')
      setProfileImageDataUrl('')
      await load()
    } catch (err) {
      toast.error(err?.message || 'Could not create registrar account.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">Create Registrar Account</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Registrar accounts can manage Sections, Students, Faculties, and the Archive Vault only.
        </p>
        <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Full name</label>
            <input
              type="text"
              required
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Login ID / username</label>
            <input
              type="text"
              required
              minLength={3}
              pattern="[A-Za-z0-9_.]+"
              title="Letters, numbers, dots, and underscores only (min 3 characters)"
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
            <p className="mt-1 text-xs text-neutral-500">
              Use letters, numbers, dots, and underscores only (e.g. registrar.office). Do not use your email address.
            </p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-neutral-700">Temporary password</label>
            <PasswordInput
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              required
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-sm font-medium text-neutral-700">Profile photo (optional)</label>
            <div className="flex flex-wrap items-center gap-4">
              {profilePreview ? (
                <img
                  src={profilePreview}
                  alt="Profile preview"
                  className="h-16 w-16 rounded-full object-cover ring-2 ring-neutral-100"
                />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-500">
                  No photo
                </div>
              )}
              <div>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg"
                  onChange={handlePhotoChange}
                  className="block text-sm text-neutral-700 file:mr-3 file:rounded-lg file:border-0 file:bg-neutral-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-neutral-800 hover:file:bg-neutral-200"
                />
                <p className="mt-1 text-xs text-neutral-500">{PHOTO_UPLOAD_LABEL}</p>
              </div>
            </div>
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-[#1e4fa3] px-5 py-2.5 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-60"
            >
              {submitting ? 'Creating…' : 'Create Registrar'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-bold text-neutral-900">Registrar Accounts</h2>
        {loading ? (
          <p className="mt-4 text-sm text-neutral-600">Loading…</p>
        ) : registrars.length === 0 ? (
          <p className="mt-4 text-sm text-neutral-600">No registrar accounts yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-neutral-100">
            {registrars.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  {r.image ? (
                    <img
                      src={r.image}
                      alt=""
                      className="h-11 w-11 shrink-0 rounded-full object-cover ring-2 ring-neutral-100"
                    />
                  ) : (
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-semibold text-blue-800">
                      {(r.name || r.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-neutral-900">{r.name || r.email}</p>
                    <p className="text-sm text-neutral-600">{r.email}</p>
                    {r.username ? <p className="text-xs text-neutral-500">Login ID: {r.username}</p> : null}
                  </div>
                </div>
                <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-800">
                  Registrar
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
