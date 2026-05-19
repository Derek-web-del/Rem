import { useEffect, useRef } from 'react'

const EVENTS = [
  'mousemove',
  'mousedown',
  'keydown',
  'scroll',
  'touchstart',
  'click',
]

/**
 * Signs the user out after `timeoutMs` with no user activity (client-side guard
 * alongside Better Auth 30-minute sliding session on the server).
 * Idle time does not accumulate while the tab is hidden (avoids signing out the
 * Institute tab just because you are active in another tab).
 */
export function useIdleSession({ enabled, timeoutMs, onIdle }) {
  const timerRef = useRef(null)
  const onIdleRef = useRef(onIdle)

  useEffect(() => {
    onIdleRef.current = onIdle
  }, [onIdle])

  useEffect(() => {
    if (!enabled) return undefined

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }

    const arm = () => {
      clearTimer()
      timerRef.current = setTimeout(() => {
        onIdleRef.current?.()
      }, timeoutMs)
    }

    const reset = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        clearTimer()
        return
      }
      arm()
    }

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        clearTimer()
        return
      }
      arm()
    }

    reset()
    for (const ev of EVENTS) {
      window.addEventListener(ev, reset, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      clearTimer()
      document.removeEventListener('visibilitychange', onVisibility)
      for (const ev of EVENTS) {
        window.removeEventListener(ev, reset)
      }
    }
  }, [enabled, timeoutMs])
}
