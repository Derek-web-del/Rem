/**
 * Resolve the real client IP behind Cloudflare / DigitalOcean / other proxies.
 * Used by express-rate-limit so sign-in limits are per user, not per shared proxy IP.
 */

function headerFirst(value) {
  if (value == null || value === '') return null
  const raw = Array.isArray(value) ? value[0] : String(value)
  const first = raw.split(',')[0]?.trim()
  return first || null
}

/** @param {import('express').Request} req */
export function resolveClientIp(req) {
  const headers = req?.headers || {}
  const cf = headerFirst(headers['cf-connecting-ip'])
  if (cf) return cf
  const real = headerFirst(headers['x-real-ip'])
  if (real) return real
  const xff = headerFirst(headers['x-forwarded-for'])
  if (xff) return xff
  return req?.ip || req?.socket?.remoteAddress || 'unknown'
}

/** @param {import('express').Request} req */
export function extractSessionToken(req) {
  const cookie = req?.headers?.cookie
  if (!cookie) return null
  const patterns = [
    /(?:^|;\s*)(?:__Secure-)?better-auth\.session_token=([^;]+)/i,
    /(?:^|;\s*)better-auth\.session_token=([^;]+)/i,
  ]
  for (const re of patterns) {
    const m = cookie.match(re)
    if (m?.[1]) {
      try {
        return decodeURIComponent(m[1].trim())
      } catch {
        return m[1].trim()
      }
    }
  }
  return null
}

/**
 * Rate-limit key: logged-in users get their own bucket (fixes shared school Wi‑Fi / NAT).
 * Anonymous requests (sign-in page) still keyed by client IP.
 * @param {import('express').Request} req
 */
export function resolveRateLimitKey(req) {
  const session = extractSessionToken(req)
  if (session) return `sess:${session.slice(0, 48)}`
  return `ip:${resolveClientIp(req)}`
}

/** @param {import('express').Request} req */
export function clientIpDebug(req) {
  return {
    resolved: resolveClientIp(req),
    rate_limit_key: resolveRateLimitKey(req),
    has_session: Boolean(extractSessionToken(req)),
    req_ip: req?.ip ?? null,
    cf_connecting_ip: headerFirst(req?.headers?.['cf-connecting-ip']),
    x_real_ip: headerFirst(req?.headers?.['x-real-ip']),
    x_forwarded_for: headerFirst(req?.headers?.['x-forwarded-for']),
  }
}
