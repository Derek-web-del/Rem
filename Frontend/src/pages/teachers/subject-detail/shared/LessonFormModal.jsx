import { useEffect, useState } from 'react'
import { ACTION_BLUE } from '../../instituteChrome.js'

export default function LessonFormModal({ open, initial, topicTitle, onClose, onSave, saving }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [lessonNumber, setLessonNumber] = useState('')

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title || '')
    setDescription(initial?.description || '')
    setLessonNumber(initial?.lesson_number != null ? String(initial.lesson_number) : '')
  }, [open, initial])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-neutral-900">
          {initial?.id ? 'Edit lesson' : 'Add lesson'}
          {topicTitle ? <span className="block text-xs font-normal text-neutral-500">{topicTitle}</span> : null}
        </h3>
        <div className="mt-4 space-y-3">
          <label className="block text-sm">
            Lesson title <span className="text-red-600">*</span>
            <input className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block text-sm">
            Lesson number
            <input type="number" min={1} className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" value={lessonNumber} onChange={(e) => setLessonNumber(e.target.value)} placeholder="Auto" />
          </label>
          <label className="block text-sm">
            Description
            <textarea className="mt-1 w-full rounded-md border border-neutral-300 px-3 py-2 text-sm" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="rounded-md border border-neutral-300 px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={saving || !title.trim()}
            className="rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            style={{ backgroundColor: ACTION_BLUE }}
            onClick={() =>
              onSave({
                title: title.trim(),
                description: description.trim(),
                lesson_number: lessonNumber ? Number(lessonNumber) : undefined,
              })
            }
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
