import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const NotificationsContext = createContext(null)

function randomId() {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }
}

function variantStyles(variant, tone) {
  // Variants for CRUD actions (requested):
  // - created: green
  // - updated: yellow
  // - deleted: red
  if (variant === 'created') return { bar: 'bg-emerald-500', border: 'border-emerald-500' }
  if (variant === 'updated') return { bar: 'bg-amber-400', border: 'border-amber-400' }
  if (variant === 'deleted') return { bar: 'bg-red-500', border: 'border-red-500' }

  // Fallback to tone-based styles
  if (tone === 'error') return { bar: 'bg-red-500', border: 'border-red-500' }
  if (tone === 'warning') return { bar: 'bg-amber-400', border: 'border-amber-400' }
  if (tone === 'info') return { bar: 'bg-blue-500', border: 'border-blue-500' }
  return { bar: 'bg-emerald-500', border: 'border-emerald-500' }
}

export function NotificationsProvider({ children }) {
  const [items, setItems] = useState([])
  const timers = useRef(new Map())
  const activeByToastId = useRef(new Map())

  const remove = useCallback((id) => {
    setItems((prev) => prev.filter((t) => t.id !== id))
    const t = timers.current.get(id)
    if (t) clearTimeout(t)
    timers.current.delete(id)
    for (const [toastId, mappedId] of activeByToastId.current.entries()) {
      if (mappedId === id) activeByToastId.current.delete(toastId)
    }
  }, [])

  const notify = useCallback(
    (message, opts = {}) => {
      const toastId = String(opts.toastId || '').trim()
      const tone = opts.tone || 'success'
      const title = opts.title || ''
      const ms = Number.isFinite(Number(opts.durationMs)) ? Number(opts.durationMs) : 5000
      const variant = opts.variant || ''
      const id = toastId || randomId()

      if (toastId) {
        const existingId = activeByToastId.current.get(toastId)
        if (existingId) remove(existingId)
        activeByToastId.current.set(toastId, id)
      }

      const item = { id, toastId, tone, variant, title, message: String(message || ''), durationMs: ms }
      setItems((prev) => {
        const withoutDup = toastId ? prev.filter((t) => t.toastId !== toastId) : prev
        return [item, ...withoutDup].slice(0, 3)
      })
      const handle = setTimeout(() => remove(id), ms)
      timers.current.set(id, handle)
      return id
    },
    [remove],
  )

  const api = useMemo(() => ({ notify, remove }), [notify, remove])

  return (
    <NotificationsContext.Provider value={api}>
      {children}
      <NotificationViewport items={items} onClose={remove} />
    </NotificationsContext.Provider>
  )
}

export function useNotify() {
  const ctx = useContext(NotificationsContext)
  return useMemo(() => {
    if (!ctx) {
      return {
        notify: () => '',
        remove: () => {},
        success: () => '',
        error: () => '',
        info: () => '',
        created: () => '',
        updated: () => '',
        deleted: () => '',
        warning: () => '',
      }
    }
    return {
      notify: ctx.notify,
      remove: ctx.remove,
      success: (msg, opts = {}) => ctx.notify(msg, { ...opts, tone: 'success' }),
      error: (msg, opts = {}) => ctx.notify(msg, { ...opts, tone: 'error' }),
      info: (msg, opts = {}) => ctx.notify(msg, { ...opts, tone: 'info' }),
      created: (msg, opts = {}) => ctx.notify(msg, { ...opts, variant: 'created', tone: 'success' }),
      updated: (msg, opts = {}) => ctx.notify(msg, { ...opts, variant: 'updated', tone: 'info' }),
      deleted: (msg, opts = {}) => ctx.notify(msg, { ...opts, variant: 'deleted', tone: 'error' }),
      warning: (msg, opts = {}) => ctx.notify(msg, { ...opts, tone: 'warning' }),
    }
  }, [ctx])
}

function NotificationViewport({ items, onClose }) {
  if (typeof document === 'undefined') return null
  const el = (
    <div className="pointer-events-none fixed right-4 top-4 z-[9999] flex w-[min(420px,calc(100vw-2rem))] flex-col gap-3">
      <style>{`@keyframes lenlearnToastProgress { from { transform: scaleX(0); } to { transform: scaleX(1); } }`}</style>
      {items.map((t) => (
        <Toast key={t.id} item={t} onClose={() => onClose(t.id)} />
      ))}
    </div>
  )
  return createPortal(el, document.body)
}

function Toast({ item, onClose }) {
  const s = variantStyles(item.variant, item.tone)
  return (
    <div className={`pointer-events-auto overflow-hidden rounded-xl border-2 ${s.border} bg-white text-neutral-900 shadow-lg`}>
      <div className="h-1 bg-neutral-100">
        <div
          className={`h-full ${s.bar}`}
          style={{
            transformOrigin: 'left',
            animation: `lenlearnToastProgress ${item.durationMs || 5000}ms linear forwards`,
          }}
        />
      </div>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          {item.title ? <div className="text-sm font-bold">{item.title}</div> : null}
          <div className="text-sm font-semibold">{item.message}</div>
        </div>
        <button
          type="button"
          className="rounded px-2 py-1 text-xs font-bold text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
          onClick={onClose}
          aria-label="Close notification"
        >
          ✕
        </button>
      </div>
    </div>
  )
}

