import { useCallback, useEffect, useRef, useState } from 'react'
import { getListSnapshot, saveListSnapshot } from '../lib/indexedDB.js'
import { isOnline } from '../lib/offlineSync.js'

/**
 * Load list data online (fetch + cache) with IndexedDB fallback when offline.
 * @param {{ storeName: string, fetchFn: () => Promise<Array>, listKey?: string, enabled?: boolean }} opts
 */
export function useOfflineListData({ storeName, fetchFn, listKey = 'list', enabled = true }) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [fromCache, setFromCache] = useState(false)
  const fetchRef = useRef(fetchFn)
  fetchRef.current = fetchFn

  const load = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    setFromCache(false)

    try {
      if (!isOnline()) throw new Error('offline')
      const list = await fetchRef.current()
      const items = Array.isArray(list) ? list : []
      setData(items)
      await saveListSnapshot(storeName, items, listKey)
    } catch (err) {
      try {
        const cached = await getListSnapshot(storeName, listKey)
        if (cached.length > 0) {
          setData(cached)
          setFromCache(true)
        } else {
          setData([])
          const msg = !isOnline()
            ? 'No offline data — connect to load content.'
            : String(err?.message || err || 'Failed to load.')
          setError(msg)
        }
      } catch {
        setData([])
        setError(String(err?.message || err || 'Failed to load.'))
      }
    } finally {
      setLoading(false)
    }
  }, [storeName, listKey, enabled])

  useEffect(() => {
    void load()
  }, [load])

  return { data, setData, loading, error, fromCache, reload: load }
}
