import { getFromStore, saveToStore } from './indexedDB.js'
import { isOnline } from './offlineSync.js'

/**
 * @template T
 * @param {{
 *   storeName: string,
 *   id: string,
 *   fetchOnline: () => Promise<T>,
 *   toCache: (data: T) => Record<string, unknown> | null,
 *   fromCache: (row: Record<string, unknown>) => T | null,
 * }} opts
 * @returns {Promise<{ data: T, fromCache: boolean }>}
 */
export async function fetchWithOfflineCache(opts) {
  const { storeName, id, fetchOnline, toCache, fromCache } = opts
  const key = String(id ?? '').trim()
  if (!key) throw new Error('Cache id is required.')

  if (isOnline()) {
    try {
      const fresh = await fetchOnline()
      const record = toCache(fresh)
      if (record && record.id != null) {
        await saveToStore(storeName, record)
      }
      return { data: fresh, fromCache: false }
    } catch (e) {
      const row = await getFromStore(storeName, key)
      if (row) {
        const cached = fromCache(row)
        if (cached != null) return { data: cached, fromCache: true }
      }
      throw e
    }
  }

  const row = await getFromStore(storeName, key)
  if (row) {
    const cached = fromCache(row)
    if (cached != null) return { data: cached, fromCache: true }
  }

  throw new Error('No offline data — connect to load content.')
}

/** Strip IndexedDB metadata from a cached row. */
export function stripCacheMeta(row) {
  if (!row || typeof row !== 'object') return row
  const { cachedAt: _c, updatedAt: _u, ...rest } = row
  return rest
}

/** After a detail view loads online, optionally warm PDF paths into the SW cache. */
export async function warmViewedContent({ pdfPaths = [] } = {}) {
  if (!isOnline() || !Array.isArray(pdfPaths) || pdfPaths.length === 0) return
  const { prefetchStudyMaterialPdfs } = await import('./pdfCacheStatus.js')
  await prefetchStudyMaterialPdfs(pdfPaths.filter(Boolean), { limit: pdfPaths.length })
}
