import { uploadsPathToApiUrl } from './fileUrls.js'
import { resolveStudyMaterialFileUrl } from './facultyStudyMaterials.js'
import { isOnline } from './offlineSync.js'
import { apiUrl } from './lmsStateStorage.js'

/** Must match `PDF_CACHE` in `public/sw.js` (`lenlearn-v4-pdf`). */
export const PDF_CACHE_NAME = 'lenlearn-v4-pdf'
const PDF_LRU_KEY = 'lenlearn_pdf_lru'
const PDF_LRU_MAX = 50

export function resolvePdfUrl(filePath) {
  if (!filePath) return ''
  const raw = String(filePath).trim()
  if (!raw) return ''
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw
  if (raw.startsWith('/api/')) return apiUrl(raw)
  return resolveStudyMaterialFileUrl(raw) || uploadsPathToApiUrl(raw) || ''
}

function readPdfLru() {
  try {
    const raw = localStorage.getItem(PDF_LRU_KEY)
    const list = raw ? JSON.parse(raw) : []
    return Array.isArray(list) ? list.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}

function writePdfLru(urls) {
  try {
    localStorage.setItem(PDF_LRU_KEY, JSON.stringify(urls.slice(0, PDF_LRU_MAX)))
  } catch {
    void 0
  }
}

async function touchPdfLru(url) {
  if (!url || typeof caches === 'undefined') return
  const list = readPdfLru().filter((u) => u !== url)
  list.unshift(url)
  const removed = list.splice(PDF_LRU_MAX)
  writePdfLru(list)
  if (removed.length) {
    try {
      const cache = await caches.open(PDF_CACHE_NAME)
      await Promise.all(removed.map((u) => cache.delete(u)))
    } catch {
      void 0
    }
  }
}

/** @param {string|null|undefined} filePath */
export async function isPdfCached(filePath) {
  if (typeof caches === 'undefined') return false
  const url = resolvePdfUrl(filePath)
  if (!url) return false
  try {
    const cache = await caches.open(PDF_CACHE_NAME)
    const match = await cache.match(url)
    return Boolean(match)
  } catch {
    return false
  }
}

/** @param {string|null|undefined} filePath */
export async function getCachedPdfBlob(filePath) {
  if (typeof caches === 'undefined') return null
  const url = resolvePdfUrl(filePath)
  if (!url) return null
  try {
    const cache = await caches.open(PDF_CACHE_NAME)
    const match = await cache.match(url)
    if (!match?.ok) return null
    return await match.blob()
  } catch {
    return null
  }
}

/**
 * Cache a PDF after the user views it (online). Applies LRU eviction.
 * @param {string|null|undefined} filePath
 */
export async function cachePdfOnView(filePath) {
  if (!isOnline() || typeof caches === 'undefined') return false
  const url = resolvePdfUrl(filePath)
  if (!url) return false
  try {
    const cache = await caches.open(PDF_CACHE_NAME)
    if (await cache.match(url)) {
      await touchPdfLru(url)
      return true
    }
    const res = await fetch(url, { credentials: 'include' })
    if (!res.ok) return false
    await cache.put(url, res.clone())
    await touchPdfLru(url)
    return true
  } catch {
    return false
  }
}

/**
 * Download PDF from service worker cache when available.
 * @returns {'cached' | 'network' | 'unavailable'}
 */
export async function downloadCachedPdf(filePath, fileName) {
  const blob = await getCachedPdfBlob(filePath)
  if (blob) {
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = fileName || 'document.pdf'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objectUrl)
    return 'cached'
  }

  const url = resolvePdfUrl(filePath)
  if (!url) return 'unavailable'

  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return 'unavailable'
  }

  const a = document.createElement('a')
  a.href = url
  a.download = fileName || 'document.pdf'
  a.target = '_blank'
  a.rel = 'noopener noreferrer'
  document.body.appendChild(a)
  a.click()
  a.remove()
  return 'network'
}

/** Pre-fetch PDFs into the service-worker PDF cache (first N materials while online). */
export async function prefetchStudyMaterialPdfs(filePaths, { limit = 50 } = {}) {
  if (!isOnline() || typeof caches === 'undefined') return
  const paths = (Array.isArray(filePaths) ? filePaths : []).filter(Boolean).slice(0, limit)
  if (paths.length === 0) return
  await Promise.allSettled(paths.map((filePath) => cachePdfOnView(filePath)))
}
