import { useCallback, useEffect, useState } from 'react'
import apiFetch from '../../lib/apiClient.js'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'

export default function RegistrarAccountsPage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [registrars, setRegistrars] = useState([])
  const [form, setForm] = useState({ name: '', email: '', username: '', password: '' })
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

  async function handleSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const res = await apiFetch(apiUrl('/api/v1/admin/registrars'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(data?.message || 'Could not create registrar account.')
      }
      toast.success('Registrar account created.')
      setForm({ name: '', email: '', username: '', password: '' })
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
              value={form.username}
              onChange={(e) => setForm((p) => ({ ...p, username: e.target.value }))}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm"
            />
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
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-semibold text-neutral-900">{r.name || r.email}</p>
                  <p className="text-sm text-neutral-600">{r.email}</p>
                  {r.username ? <p className="text-xs text-neutral-500">Login ID: {r.username}</p> : null}
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
