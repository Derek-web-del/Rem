import { useEffect, useState } from 'react'
import { useFacultyNotify } from '../../../lib/facultyNotify.js'
import {
  createSyllabusWeek,
  deleteSyllabusWeek,
  fetchSyllabusWeeks,
  updateSyllabusWeek,
} from '../../../lib/teacherSubjectCurriculum.js'

function WeekRow({ week, index, onRefine, onRemove, editing, draft, onDraftChange, onSave, onCancel, saving, confirmingRemove, onConfirmRemove, onCancelRemove }) {
  if (editing) {
    return (
      <li className="rounded-lg border border-sky-200 bg-sky-50/40 p-3">
        <input
          type="text"
          className="w-full rounded border px-3 py-1.5 text-sm font-medium"
          value={draft.title}
          onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
          placeholder={`Week ${index + 1} title`}
        />
        <textarea
          className="mt-2 w-full rounded border px-3 py-1.5 text-sm"
          rows={3}
          value={draft.content}
          onChange={(e) => onDraftChange({ ...draft, content: e.target.value })}
          placeholder="Notes for this week (optional)"
        />
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            className="rounded bg-emerald-600 px-3 py-1 text-xs font-semibold text-white disabled:opacity-60"
            disabled={saving || !draft.title.trim()}
            onClick={onSave}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" className="rounded border px-3 py-1 text-xs font-medium text-neutral-600" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </li>
    )
  }

  return (
    <li className="rounded-lg border bg-neutral-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-neutral-900">
            Week {index + 1} · {week.title}
          </p>
          {week.content ? <p className="mt-1 text-sm text-neutral-700">{week.content}</p> : null}
        </div>
        <div className="flex shrink-0 gap-2">
          {confirmingRemove ? (
            <>
              <button type="button" className="rounded border border-red-300 px-2.5 py-1 text-xs font-semibold text-red-700" onClick={onConfirmRemove}>
                Confirm
              </button>
              <button type="button" className="rounded border px-2.5 py-1 text-xs text-neutral-600" onClick={onCancelRemove}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button type="button" className="rounded border border-neutral-300 px-2.5 py-1 text-xs font-medium text-neutral-700" onClick={onRefine}>
                Refine
              </button>
              <button type="button" className="rounded border border-neutral-300 px-2.5 py-1 text-xs text-neutral-500" onClick={onRemove}>
                Remove
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  )
}

/** Ordered syllabus weeks auto-generated from the subject's linked curriculum guide. Renders nothing
 * if the subject has no curriculum-derived weeks yet — the existing PDF "+ Add Syllabus" flow still
 * covers subjects without a linked curriculum. */
export default function SubjectSyllabusWeeks({ subjectId }) {
  const toast = useFacultyNotify()
  const [weeks, setWeeks] = useState([])
  const [derivedFrom, setDerivedFrom] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState(null)
  const [draft, setDraft] = useState({ title: '', content: '' })
  const [saving, setSaving] = useState(false)
  const [removingId, setRemovingId] = useState(null)
  const [addingWeek, setAddingWeek] = useState(false)

  useEffect(() => {
    if (!subjectId) return undefined
    let cancelled = false

    const loadWeeks = async () => {
      setLoading(true)
      try {
        const { weeks: w, derivedFrom: d } = await fetchSyllabusWeeks(subjectId)
        if (cancelled) return
        setWeeks(w)
        setDerivedFrom(d)
      } catch {
        if (!cancelled) setWeeks([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void loadWeeks()
    return () => {
      cancelled = true
    }
  }, [subjectId])

  function startRefine(week) {
    setEditingId(week.id)
    setDraft({ title: week.title, content: week.content || '' })
  }

  async function saveRefine() {
    if (!draft.title.trim()) return
    setSaving(true)
    try {
      const updated = await updateSyllabusWeek(subjectId, editingId, { title: draft.title, content: draft.content })
      setWeeks((prev) => prev.map((w) => (w.id === updated.id ? updated : w)))
      setEditingId(null)
      toast.success('Week updated.')
    } catch (e) {
      toast.error(String(e?.message || e || 'Could not save week.'))
    } finally {
      setSaving(false)
    }
  }

  async function removeWeek(weekId) {
    try {
      await deleteSyllabusWeek(subjectId, weekId)
      setWeeks((prev) => prev.filter((w) => w.id !== weekId))
      setRemovingId(null)
      toast.success('Week removed.')
    } catch (e) {
      toast.error(String(e?.message || e || 'Could not remove week.'))
    }
  }

  async function addWeek() {
    setAddingWeek(true)
    try {
      const created = await createSyllabusWeek(subjectId, { title: `Week ${weeks.length + 1}`, content: '' })
      setWeeks((prev) => [...prev, created])
      startRefine(created)
    } catch (e) {
      toast.error(String(e?.message || e || 'Could not add week.'))
    } finally {
      setAddingWeek(false)
    }
  }

  if (loading || weeks.length === 0) return null

  return (
    <section className="mx-4 mt-4 rounded-xl border border-neutral-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Syllabus</p>
          {derivedFrom ? (
            <p className="mt-0.5 inline-flex items-center rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-700">
              Auto-generated from {derivedFrom} Curriculum
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="rounded-lg border border-emerald-600 px-3 py-1.5 text-xs font-semibold text-emerald-700 disabled:opacity-60"
          onClick={addWeek}
          disabled={addingWeek}
        >
          {addingWeek ? 'Adding…' : '+ Add week'}
        </button>
      </div>

      <ol className="mt-3 space-y-2">
        {weeks.map((week, index) => (
          <WeekRow
            key={week.id}
            week={week}
            index={index}
            editing={editingId === week.id}
            draft={draft}
            onDraftChange={setDraft}
            onRefine={() => startRefine(week)}
            onSave={saveRefine}
            onCancel={() => setEditingId(null)}
            saving={saving}
            confirmingRemove={removingId === week.id}
            onRemove={() => setRemovingId(week.id)}
            onConfirmRemove={() => removeWeek(week.id)}
            onCancelRemove={() => setRemovingId(null)}
          />
        ))}
      </ol>
    </section>
  )
}
