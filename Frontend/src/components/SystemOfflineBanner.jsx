import { useEffect, useState } from 'react'

export const POSTGRES_OFFLINE_EVENT = 'lenlearn:postgres-offline'
export const POSTGRES_ONLINE_EVENT = 'lenlearn:postgres-online'

export default function SystemOfflineBanner() {
  const [offline, setOffline] = useState(false)

  useEffect(() => {
    const onOffline = () => setOffline(true)
    const onOnline = () => setOffline(false)
    window.addEventListener(POSTGRES_OFFLINE_EVENT, onOffline)
    window.addEventListener(POSTGRES_ONLINE_EVENT, onOnline)
    return () => {
      window.removeEventListener(POSTGRES_OFFLINE_EVENT, onOffline)
      window.removeEventListener(POSTGRES_ONLINE_EVENT, onOnline)
    }
  }, [])

  if (!offline) return null

  return (
    <div
      className="shrink-0 bg-amber-100 px-4 py-2 text-sm text-amber-950"
      role="alert"
    >
      <strong>System is currently offline.</strong> Please try again.
    </div>
  )
}
