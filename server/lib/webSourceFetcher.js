const FETCH_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; LenLearn-OriginalityChecker/1.0)',
  Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
}

const PAGE_TIMEOUT_MS = 5000
const OVERALL_TIMEOUT_MS = 10000
const MAX_SOURCES = 8
const MAX_PAGE_TEXT = 3000

/** DuckDuckGo HTML search — sole web source discovery method (no API key). */
/** @param {string} query */
export async function searchWeb(query) {
  const q = String(query || '').trim()
  if (!q) return []

  try {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(q)}`
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
    const res = await fetch(url, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
    })
    clearTimeout(timer)

    if (!res.ok) return []

    const html = await res.text()
    const results = []
    const seen = new Set()

    const uddgRegex = /uddg=([^&"]+)/g
    let match
    while ((match = uddgRegex.exec(html)) !== null && results.length < 5) {
      try {
        const decoded = decodeURIComponent(match[1])
        if (!decoded.startsWith('http') || seen.has(decoded)) continue
        seen.add(decoded)
        results.push({ url: decoded, title: decoded })
      } catch {
        /* skip malformed */
      }
    }

    if (results.length) {
      const titleRegex =
        /class="result__a"[^>]*href="[^"]*"[^>]*>([^<]+)<\/a>|class="result__title"[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>/gi
      let titleMatch
      let idx = 0
      while ((titleMatch = titleRegex.exec(html)) !== null && idx < results.length) {
        const title = String(titleMatch[1] || titleMatch[2] || '').trim()
        if (title) results[idx].title = title
        idx += 1
      }
    }

    return results
  } catch {
    return []
  }
}

/** @param {string} url */
export async function fetchPageText(url) {
  const target = String(url || '').trim()
  if (!target.startsWith('http')) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS)
    const res = await fetch(target, {
      signal: controller.signal,
      headers: FETCH_HEADERS,
      redirect: 'follow',
    })
    clearTimeout(timer)

    if (!res.ok) return null

    const contentType = String(res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
      return null
    }

    const html = await res.text()
    let text = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
      .replace(/<header[\s\S]*?<\/header>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#\d+;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (!text) return null
    return text.slice(0, MAX_PAGE_TEXT)
  } catch {
    return null
  }
}

/** @param {string} submittedText */
export async function getWebSources(submittedText) {
  const deadline = Date.now() + OVERALL_TIMEOUT_MS
  const sentences = String(submittedText || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 30)
    .sort((a, b) => b.length - a.length)
    .slice(0, 3)

  const queries = sentences.length ? sentences : [String(submittedText || '').slice(0, 120)]

  const urlMap = new Map()
  for (const query of queries) {
    if (Date.now() >= deadline) break
    const hits = await searchWeb(query)
    for (const hit of hits) {
      if (!hit.url || urlMap.has(hit.url)) continue
      urlMap.set(hit.url, { url: hit.url, title: hit.title || hit.url })
      if (urlMap.size >= MAX_SOURCES) break
    }
    if (urlMap.size >= MAX_SOURCES) break
  }

  const entries = [...urlMap.values()].slice(0, MAX_SOURCES)
  const settled = await Promise.allSettled(
    entries.map(async (entry) => {
      if (Date.now() >= deadline) return null
      const text = await fetchPageText(entry.url)
      if (!text || text.length < 50) return null
      return { url: entry.url, title: entry.title, text }
    }),
  )

  return settled
    .map((r) => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean)
}
