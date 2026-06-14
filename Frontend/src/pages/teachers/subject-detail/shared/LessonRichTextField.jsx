import { useCallback, useEffect, useRef } from 'react'
import { sanitizeHtml } from '../../../../lib/sanitizeHtml.js'

function ToolbarButton({ label, icon, onClick, active }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      className={`rounded p-1.5 text-neutral-600 hover:bg-neutral-100 ${active ? 'bg-neutral-100 text-neutral-900' : ''}`}
      onMouseDown={(e) => {
        e.preventDefault()
        onClick()
      }}
    >
      {icon}
    </button>
  )
}

export default function LessonRichTextField({ value, onChange, placeholder = 'Description (optional)' }) {
  const editorRef = useRef(null)

  useEffect(() => {
    const el = editorRef.current
    if (!el) return
    const safe = sanitizeHtml(value || '')
    if (el.innerHTML !== safe) {
      el.innerHTML = safe
    }
  }, [value])

  const readEditorHtml = () => {
    const raw = editorRef.current?.innerHTML || ''
    const html = sanitizeHtml(raw)
    return html === '<br>' ? '' : html
  }

  const exec = useCallback((cmd, val = null) => {
    document.execCommand(cmd, false, val)
    onChange(readEditorHtml())
  }, [onChange])

  const handleInput = () => {
    onChange(readEditorHtml())
  }

  return (
    <div className="mt-4">
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        className="lesson-rich-editor min-h-[120px] w-full text-sm text-neutral-800 outline-none"
        onInput={handleInput}
        suppressContentEditableWarning
      />
      <div className="mt-2 flex items-center gap-0.5 border-t border-neutral-100 pt-2">
        <ToolbarButton label="Bold" icon={<span className="text-sm font-bold">B</span>} onClick={() => exec('bold')} />
        <ToolbarButton label="Italic" icon={<span className="text-sm italic">I</span>} onClick={() => exec('italic')} />
        <ToolbarButton label="Underline" icon={<span className="text-sm underline">U</span>} onClick={() => exec('underline')} />
        <ToolbarButton
          label="Bulleted list"
          icon={<i className="ti ti-list text-base" aria-hidden="true" />}
          onClick={() => exec('insertUnorderedList')}
        />
        <ToolbarButton
          label="Clear formatting"
          icon={<span className="text-xs font-medium text-neutral-500">T<sub>x</sub></span>}
          onClick={() => exec('removeFormat')}
        />
      </div>
    </div>
  )
}
