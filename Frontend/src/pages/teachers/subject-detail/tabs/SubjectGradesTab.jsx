import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchSubjectGradeCriteria, saveSubjectGradeCriteria } from '../../../../lib/teacherSubjectCurriculum.js'
import { useFacultyNotify } from '../../../../lib/facultyNotify.js'
import GradeCriteriaView from '../grades/GradeCriteriaView.jsx'
import GradeCriteriaEditorModal from '../grades/GradeCriteriaEditorModal.jsx'
import { ACTION_BLUE } from '../../instituteChrome.js'

export default function SubjectGradesTab({ subjectId, subject }) {
  const toast = useFacultyNotify()
  const [criteria, setCriteria] = useState(null)
  const [loading, setLoading] = useState(true)
  const [editorOpen, setEditorOpen] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const crit = await fetchSubjectGradeCriteria(subjectId)
        if (!cancelled) setCriteria(crit)
      } catch (e) {
        if (!cancelled) toast.error(String(e?.message || 'Could not load grade criteria.'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [subjectId, toast])

  const handleSave = async (payload) => {
    setSaving(true)
    try {
      const saved = await saveSubjectGradeCriteria(subjectId, payload)
      setCriteria(saved)
      setEditorOpen(false)
      toast.success('Grade criteria saved.')
    } catch (e) {
      toast.error(String(e?.message || 'Could not save grade criteria.'))
    } finally {
      setSaving(false)
    }
  }

  const hasCriteria =
    (Array.isArray(criteria?.components) && criteria.components.length > 0) ||
    (Array.isArray(criteria?.criteria) && criteria.criteria.length > 0)

  if (loading) {
    return <p className="px-4 py-8 text-sm text-neutral-500">Loading grades…</p>
  }

  return (
    <>
      <div className="flex flex-wrap items-center justify-end gap-2 border-b border-neutral-200 px-4 py-2">
        <Link
          to={`/teacher/subjects/${subjectId}/gradebook`}
          className="rounded-md px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          style={{ background: ACTION_BLUE }}
        >
          Open Gradebook
        </Link>
        <button
          type="button"
          className="rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          onClick={() => setEditorOpen(true)}
        >
          Edit criteria
        </button>
      </div>
      {!hasCriteria ? (
        <div className="px-4 py-8 text-center">
          <p className="text-sm font-medium text-neutral-800">Grade criteria not set up yet</p>
          <p className="mt-1 text-xs text-neutral-500">Configure components before opening the gradebook.</p>
          <button
            type="button"
            className="mt-3 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
            onClick={() => setEditorOpen(true)}
          >
            Set up grade criteria
          </button>
        </div>
      ) : (
        <GradeCriteriaView criteria={criteria} subject={subject} />
      )}
      <GradeCriteriaEditorModal
        open={editorOpen}
        criteria={criteria}
        subject={subject}
        saving={saving}
        onClose={() => setEditorOpen(false)}
        onSave={handleSave}
      />
    </>
  )
}
