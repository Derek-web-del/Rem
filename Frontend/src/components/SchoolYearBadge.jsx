import { useCallback, useEffect, useState } from 'react'
import { fetchSchoolYear, updateSchoolYear } from '../lib/schoolYear.js'

const SCHOOL_YEAR_PATTERN = /^\d{4}-\d{4}$/

/**
 * Global, informational-only "School Year" badge (e.g. "SY 2025-2026").
 * Read-only for Faculty/Student; with `editable`, Admin can click to change it.
 */
export default function SchoolYearBadge({ editable = false, className = '' }) {
  const [schoolYear, setSchoolYearState] = useState(null)
  const [loaded, setLoaded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const value = await fetchSchoolYear()
    setSchoolYearState(value)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  function startEditing() {
    if (!editable) return
    setDraft(schoolYear || '')
    setError('')
    setEditing(true)
  }

  function cancelEditing() {
    setEditing(false)
    setError('')
  }

  async function handleSave() {
    const trimmed = draft.trim()
    if (!SCHOOL_YEAR_PATTERN.test(trimmed)) {
      setError('Use the format YYYY-YYYY, e.g. 2025-2026.')
      return
    }
    setSaving(true)
    setError('')
    try {
      const data = await updateSchoolYear(trimmed)
      setSchoolYearState(data?.schoolYear || trimmed)
      setEditing(false)
    } catch (e) {
      setError(e?.message || 'Could not save the school year.')
    } finally {
      setSaving(false)
    }
  }

  if (!loaded) return null

  if (editing) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${className}`}>
        <input
          type="text"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="2025-2026"
          disabled={saving}
          className="w-32 rounded-lg border border-neutral-300 px-2.5 py-1.5 text-xs font-semibold text-neutral-800 focus:border-blue-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={cancelEditing}
          disabled={saving}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-600 hover:bg-neutral-100 disabled:opacity-60"
        >
          Cancel
        </button>
        {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
      </div>
    )
  }

  const label = schoolYear ? `SY ${schoolYear}` : editable ? 'Set school year' : 'School year not set'

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={!editable}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold ${
        editable
          ? 'cursor-pointer border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'
          : 'cursor-default border-neutral-200 bg-neutral-100 text-neutral-600'
      } ${className}`}
      title={editable ? 'Click to edit the school year' : undefined}
    >
      <i className="ti ti-calendar" aria-hidden="true" />
      {label}
    </button>
  )
}
