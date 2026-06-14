const CACHE_VERSION = 'lenlearn-v2'
const STATIC_CACHE = `${CACHE_VERSION}-static`
const DYNAMIC_CACHE = `${CACHE_VERSION}-dynamic`
const PDF_CACHE = `${CACHE_VERSION}-pdf`
const ALLOWED = new Set([STATIC_CACHE, DYNAMIC_CACHE, PDF_CACHE])

const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/offline.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
]

const OFFLINE_JSON = JSON.stringify({
  offline: true,
  message: 'You are offline. Showing last loaded data.',
})

function offlineJsonResponse() {
  return new Response(OFFLINE_JSON, {
    status: 503,
    headers: { 'Content-Type': 'application/json', 'X-Offline': 'true' },
  })
}

function isReadOnlyApiRoute(pathname) {
  const p = pathname.replace(/\/+$/, '') || '/'
  const readOnly = [
    /^\/api\/v1\/student\/subjects\/[^/]+\/stream$/,
    /^\/api\/v1\/student\/subjects(\/[^/]+(\/(materials))?)?$/,
    /^\/api\/v1\/student\/study-materials(\/[^/]+)?$/,
    /^\/api\/v1\/student\/assignments(\/[^/]+)?$/,
    /^\/api\/v1\/student\/activities(\/[^/]+)?$/,
    /^\/api\/v1\/student\/announcements(\/[^/]+)?$/,
    /^\/api\/v1\/student\/profile$/,
    /^\/api\/v1\/student\/quizzes$/,
    /^\/api\/v1\/student\/quizzes\/[^/]+$/,
    /^\/api\/v1\/student\/quizzes\/[^/]+\/results$/,
    /^\/api\/v1\/grades\/my$/,
    /^\/api\/teacher\/subjects(\/[^/]+(\/(materials|syllabus-file|stream))?)?$/,
    /^\/api\/teacher\/assignments\/[^/]+$/,
    /^\/api\/teacher\/activities\/[^/]+$/,
    /^\/api\/teacher\/quizzes\/[^/]+$/,
    /^\/api\/teacher\/advisory-sections(\/[^/]+)?$/,
    /^\/api\/teacher\/announcements(\/[^/]+)?$/,
    /^\/api\/v1\/study-materials(\/[^/]+)?$/,
    /^\/api\/v1\/quizzes(\/[^/]+(\/roster-scores)?)?$/,
    /^\/api\/v1\/grades\/section-overview$/,
    /^\/api\/v1\/grades\/student\/[^/]+$/,
  ]
  return readOnly.some((re) => re.test(p))
}

function isAuthApiRoute(pathname) {
  return pathname.startsWith('/api/auth/')
}

function isAdminApiRoute(pathname) {
  return (
    pathname.startsWith('/api/admin/') ||
    pathname.startsWith('/api/state/') ||
    pathname.startsWith('/api/monitoring/')
  )
}

function isPdfRequest(url) {
  if (url.pathname.startsWith('/api/files/')) return true
  return url.pathname.startsWith('/uploads/') && /\.pdf$/i.test(url.pathname)
}

function isApiRequest(url) {
  return url.pathname.startsWith('/api/')
}

function isStaticAsset(url, request) {
  if (url.pathname.startsWith('/assets/')) return true
  if (url.pathname.startsWith('/icons/')) return true
  if (url.pathname === '/manifest.json' || url.pathname === '/offline.html') return true
  if (request.destination === 'script' || request.destination === 'style') return true
  return false
}

/** Cache-first with background update (stale-while-revalidate style). */
async function cacheFirstWithUpdate(request, cacheName) {
  const cache = await caches.open(cacheName)
  const cached = await cache.match(request)
  const networkFetch = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone())
      return response
    })
    .catch(() => null)

  if (cached) {
    void networkFetch
    return cached
  }

  const fresh = await networkFetch
  if (fresh) return fresh
  return offlineJsonResponse()
}

async function cacheFirstPdf(request) {
  const cache = await caches.open(PDF_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  try {
    const res = await fetch(request)
    if (res.ok) cache.put(request, res.clone())
    return res
  } catch {
    return new Response('File not available offline', { status: 503 })
  }
}

async function networkFirstAsset(request, cacheName) {
  try {
    const res = await fetch(request)
    if (res.ok) {
      const cache = await caches.open(cacheName)
      cache.put(request, res.clone())
    }
    return res
  } catch {
    const cached = await caches.match(request)
    if (cached) return cached
    return caches.match('/offline.html')
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k.startsWith('lenlearn-') && !ALLOWED.has(k)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (isApiRequest(url)) {
    if (isAuthApiRoute(url.pathname) || isAdminApiRoute(url.pathname)) {
      event.respondWith(fetch(request).catch(() => offlineJsonResponse()))
      return
    }
    if (isReadOnlyApiRoute(url.pathname)) {
      event.respondWith(cacheFirstWithUpdate(request, DYNAMIC_CACHE))
      return
    }
    event.respondWith(fetch(request).catch(() => offlineJsonResponse()))
    return
  }

  if (isPdfRequest(url)) {
    event.respondWith(cacheFirstPdf(request))
    return
  }

  if (isStaticAsset(url, request)) {
    event.respondWith(networkFirstAsset(request, DYNAMIC_CACHE))
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            caches.open(STATIC_CACHE).then((c) => c.put(request, res.clone()))
          }
          return res
        })
        .catch(() => caches.match('/offline.html'))
    }),
  )
})

self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-quiz-data') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
        for (const client of clients) {
          client.postMessage({ type: 'SYNC_QUIZ_DATA' })
        }
      }),
    )
  }
})
