import { useEffect, useRef, useState } from 'react'

const MAX_LENGTH = 100
const ACTION_BLUE = '#185FA5'

export default function TopicFormModal({ open, initial, onClose, onSave, saving }) {
  const inputRef = useRef(null)
  const [title, setTitle] = useState('')
  const [touched, setTouched] = useState(false)

  const isEdit = Boolean(initial?.id)
  const trimmed = title.trim()
  const isEmpty = !trimmed
  const showError = touched && isEmpty
  const canSubmit = !saving && !isEmpty && title.length <= MAX_LENGTH

  useEffect(() => {
    if (!open) return
    setTitle(initial?.title || '')
    setTouched(false)
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [open, initial])

  useEffect(() => {
    if (!open) return
    function onKey(e) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  function handleSubmit() {
    setTouched(true)
    if (!trimmed || title.length > MAX_LENGTH) return
    onSave(trimmed)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white px-8 py-7 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="topic-form-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="topic-form-title" className="text-2xl font-normal text-neutral-900">
          {isEdit ? 'Edit topic' : 'Add topic'}
        </h2>
        <p className="mt-2 text-sm text-neutral-600">
          Topics help organize classwork into modules or units.
        </p>

        <div className="mt-8">
          <label
            htmlFor="topic-title-input"
            className={`block text-sm ${showError ? 'text-red-600' : 'text-neutral-700'}`}
          >
            Topic<span className="text-red-600">*</span>
          </label>
          <input
            ref={inputRef}
            id="topic-title-input"
            type="text"
            maxLength={MAX_LENGTH}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSubmit()
            }}
            className={`mt-1 w-full border-0 border-b-2 bg-transparent px-0 py-2 text-base text-neutral-900 outline-none focus:ring-0 ${
              showError ? 'border-red-600' : 'border-neutral-300 focus:border-[#185FA5]'
            }`}
            aria-invalid={showError}
            aria-describedby="topic-title-meta"
          />
          <div id="topic-title-meta" className="mt-1 flex items-center justify-between text-xs">
            {showError ? (
              <span className="text-red-600">*Required</span>
            ) : (
              <span className="text-transparent">*Required</span>
            )}
            <span className={showError ? 'text-red-600' : 'text-neutral-500'}>
              {title.length}/{MAX_LENGTH}
            </span>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-4">
          <button
            type="button"
            className="px-2 py-2 text-sm font-medium"
            style={{ color: ACTION_BLUE }}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSubmit}
            className="px-2 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:text-neutral-400"
            style={canSubmit ? { color: ACTION_BLUE } : undefined}
            onClick={handleSubmit}
          >
            {saving ? 'Saving…' : isEdit ? 'Save changes' : 'Add topic'}
          </button>
        </div>
      </div>
    </div>
  )
}
