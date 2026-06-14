import { useEffect, useState } from 'react'
import { useNotify } from './notifications.jsx'
import { setupOnlineSyncHandler } from '../lib/offlineSync.js'

export default function OfflineBanner() {
  const [online, setOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  )
  const [showReconnected, setShowReconnected] = useState(false)
  const { success } = useNotify()

  useEffect(() => {
    const onOffline = () => setOnline(false)
    const onOnline = () => {
      setOnline(true)
      setShowReconnected(true)
      const t = setTimeout(() => setShowReconnected(false), 4000)
      return () => clearTimeout(t)
    }

    window.addEventListener('offline', onOffline)
    window.addEventListener('online', onOnline)
    return () => {
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('online', onOnline)
    }
  }, [])

  useEffect(() => {
    return setupOnlineSyncHandler((count) => {
      if (count > 0) {
        success(`Back online! Syncing data… Synced ${count} queued submission(s).`)
      } else {
        success('Back online! Syncing data…')
      }
    })
  }, [success])

  if (online && !showReconnected) return null

  if (!online) {
    return (
      <div
        className="shrink-0 px-4 py-2 text-sm"
        style={{
          background: '#FAEEDA',
          borderBottom: '0.5px solid #EF9F27',
          color: '#633806',
        }}
        role="status"
      >
        <div className="mx-auto flex max-w-5xl items-center gap-2">
          <i className="ti ti-wifi-off shrink-0 text-base" aria-hidden="true" />
          <div>
            <strong>You are offline</strong>
            <span>
              {' '}
              — showing last loaded data. Create, edit, and submit actions are disabled until you
              reconnect.
            </span>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="shrink-0 bg-emerald-600 px-4 py-2 text-center text-sm font-semibold text-white"
      role="status"
    >
      Back online — syncing data…
    </div>
  )
}
