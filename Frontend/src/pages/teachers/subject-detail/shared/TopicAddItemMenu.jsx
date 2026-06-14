import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

export default function TopicAddItemMenu({ subjectId, topicId, buildQuery }) {
  const [open, setOpen] = useState(false)
  const [menuStyle, setMenuStyle] = useState(null)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)

  const q = buildQuery(topicId)
  const lessonPath =
    topicId && topicId !== 'uncategorized'
      ? `/teacher/subjects/${encodeURIComponent(subjectId)}/lessons/new?topic_id=${encodeURIComponent(topicId)}`
      : `/teacher/subjects/${encodeURIComponent(subjectId)}/lessons/new`
  const links = [
    { label: 'Lesson', path: lessonPath },
    { label: 'Assignment', path: `/teacher/assignments/new?${q}` },
    { label: 'Activity', path: `/teacher/activities/new?${q}` },
    { label: 'Quiz', path: `/teacher/quizzes/new?${q}` },
    { label: 'Material', path: `/teacher/subjects/${encodeURIComponent(subjectId)}/materials/add?${q}` },
  ]

  const updatePosition = useCallback(() => {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setMenuStyle({
      position: 'fixed',
      top: rect.bottom + 4,
      left: Math.max(8, rect.right - 160),
      width: 160,
      zIndex: 100,
    })
  }, [])

  useEffect(() => {
    if (!open) return undefined
    updatePosition()
    const onScrollOrResize = () => updatePosition()
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open, updatePosition])

  useEffect(() => {
    if (!open) return undefined
    const onMouseDown = (e) => {
      if (buttonRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const menu =
    open && menuStyle ? (
      <div
        ref={menuRef}
        style={menuStyle}
        className="rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
        role="menu"
      >
        {links.map((l) => (
          <Link
            key={l.label}
            to={l.path}
            className="block px-3 py-2 text-sm text-neutral-700 hover:bg-neutral-50"
            role="menuitem"
            onClick={() => setOpen(false)}
          >
            {l.label}
          </Link>
        ))}
      </div>
    ) : null

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-white"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
      >
        + Add item
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </div>
  )
}
