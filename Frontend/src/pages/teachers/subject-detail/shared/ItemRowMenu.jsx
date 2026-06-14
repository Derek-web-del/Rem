import { useEffect, useRef, useState } from 'react'

export default function ItemRowMenu({ actions = [], onAction }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  if (!actions.length) return null

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className="rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700"
        aria-label="Item actions"
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
      >
        <i className="ti ti-dots-vertical text-base" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute right-0 z-20 mt-1 min-w-[160px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 ${
                action.danger ? 'text-red-600' : 'text-neutral-700'
              }`}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                onAction?.(action.id)
              }}
            >
              {action.icon ? <i className={`ti ${action.icon}`} aria-hidden="true" /> : null}
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
