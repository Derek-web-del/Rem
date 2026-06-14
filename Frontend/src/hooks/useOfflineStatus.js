import { useCallback, useEffect, useState } from 'react'
import { isOnline } from '../lib/offlineSync.js'

export function useOfflineStatus() {
  const [offline, setOffline] = useState(() => !isOnline())

  useEffect(() => {
    const onOnline = () => setOffline(false)
    const onOffline = () => setOffline(true)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  return { isOffline: offline }
}

export function useFromCacheFlag() {
  const [fromCache, setFromCache] = useState(false)
  const markFromCache = useCallback((value = true) => setFromCache(value), [])
  const clearFromCache = useCallback(() => setFromCache(false), [])
  return { fromCache, setFromCache, markFromCache, clearFromCache }
}
