import { useCallback, useEffect, useState } from 'react'
import { apiUrl } from '../../lib/lmsStateStorage.js'
import { useNotify } from '../../components/notifications.jsx'

const GRADE_SEQUENCE = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

function suggestNextSchoolYear(current) {
  const m = /^(\d{4})-(\d{4})$/.exec(String(current || '').trim())
  if (!m) return ''
  const start = Number(m[1]) + 1
  const end = Number(m[2]) + 1
  return `${start}-${end}`
}

function isValidSchoolYear(value) {
  return /^\d{4}-\d{4}$/.test(String(value || '').trim())
}

export default function GradePromotionPage() {
  const toast = useNotify()
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [plan, setPlan] = useState(null)
  const [currentSchoolYear, setCurrentSchoolYear] = useState('')
  const [newSchoolYear, setNewSchoolYear] = useState('')
  const [confirmText, setConfirmText] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch(apiUrl('/api/v1/admin/promotion/preview'), { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Could not load promotion preview (HTTP ${res.status}).`)
      }
      setPlan(data.plan)
      setCurrentSchoolYear(data.current_school_year || '')
      setNewSchoolYear((prev) => prev || suggestNextSchoolYear(data.current_school_year))
    } catch (e) {
      setLoadError(String(e?.message || 'Could not load promotion preview.'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function handlePromote() {
    if (confirmText.trim() !== 'PROMOTE') {
      toast.error('Type PROMOTE to confirm.')
      return
    }
    if (!isValidSchoolYear(newSchoolYear)) {
      toast.error('New school year must look like "2027-2028".')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(apiUrl('/api/v1/admin/promotion/run'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'PROMOTE', new_school_year: newSchoolYear.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.success) {
        throw new Error(data?.message || data?.error || `Promotion failed (HTTP ${res.status}).`)
      }
      setResult(data)
      setConfirmText('')
      toast.success(`Promoted ${data.promoted} student(s), graduated ${data.graduated}.`)
      await load()
    } catch (e) {
      toast.error(String(e?.message || 'Promotion failed.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold text-neutral-900">Year-End Grade Promotion</h2>
        <p className="mt-1 text-sm text-neutral-600">
          Advances every active student one grade level (Grade 7&rarr;8&rarr;9&rarr;10), moves Grade 10 students to
          the Archive Vault as graduated, and updates the active school year. A safety backup is created
          automatically before anything changes.
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-neutral-500">Loading…</p>
      ) : loadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{loadError}</div>
      ) : (
        <>
          <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-md">
            <h3 className="text-base font-bold text-neutral-900">Preview</h3>
            <p className="mt-1 text-sm text-neutral-600">
              Current school year: <span className="font-semibold">{currentSchoolYear || '—'}</span>
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {GRADE_SEQUENCE.map((g) => (
                <div key={g} className="rounded-lg border border-neutral-100 bg-neutral-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase text-neutral-500">{g}</p>
                  <p className="mt-1 text-2xl font-bold text-neutral-900 tabular-nums">
                    {plan?.counts_by_current_grade?.[g] ?? 0}
                  </p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {g === 'Grade 10' ? 'will graduate' : `→ ${GRADE_SEQUENCE[GRADE_SEQUENCE.indexOf(g) + 1]}`}
                  </p>
                </div>
              ))}
            </div>

            {plan?.unresolved_grade ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {plan.unresolved_grade} active student(s) have no resolvable grade level and will be skipped.
              </div>
            ) : null}

            {plan?.needs_manual_section?.length ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                <p className="font-semibold">
                  {plan.needs_manual_section.length} student(s) will be promoted with no section assigned
                </p>
                <p className="mt-1 text-xs">
                  No section named the same as their current one exists at their target grade. They'll still be
                  promoted, just left unassigned — pick a section for them afterward from the Students page.
                </p>
              </div>
            ) : null}

            <label className="mt-5 block max-w-xs text-sm font-medium text-neutral-700">
              New school year
              <input
                type="text"
                value={newSchoolYear}
                onChange={(e) => setNewSchoolYear(e.target.value)}
                placeholder="2027-2028"
                className="mt-1 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
              />
            </label>
          </section>

          <section className="max-w-xl rounded-xl border border-red-200 bg-red-50 p-5 shadow-md">
            <h3 className="text-base font-bold text-red-900">Run promotion</h3>
            <p className="mt-1 text-sm text-red-800">
              This affects every active student at once. A safety backup is taken first and this is fully audited,
              but it isn't a casual action — double-check the counts above before confirming.
            </p>
            <label className="mt-4 block text-sm font-medium text-red-900">
              Type <span className="font-mono font-bold">PROMOTE</span> to confirm
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="mt-1 w-full rounded-lg border border-red-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
              />
            </label>
            <button
              type="button"
              disabled={submitting || confirmText.trim() !== 'PROMOTE'}
              onClick={() => void handlePromote()}
              className="mt-4 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {submitting ? 'Promoting…' : 'Promote all students'}
            </button>
          </section>
        </>
      )}

      {result ? (
        <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
          <p className="font-semibold">Promotion complete</p>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            <li>{result.promoted} student(s) promoted</li>
            <li>{result.graduated} student(s) graduated (moved to Archive Vault)</li>
            <li>{result.section_auto_matched} student(s) auto-assigned to a matching section</li>
            {result.needs_manual_section?.length ? (
              <li>{result.needs_manual_section.length} student(s) need a section picked manually</li>
            ) : null}
            <li>School year set to {result.school_year}</li>
            {result.safety_backup ? <li>Safety backup created: {result.safety_backup}</li> : null}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
