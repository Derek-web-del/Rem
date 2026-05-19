import { pickAuditEventDate } from '../../shared/auditTime.js'
import { computeAuditStatistics } from '../../shared/auditStatisticsCompute.js'
import { queryLmsAuditLogsWithTargets, toAuditIsoDate } from '../api/logs.js'
import { fetchAuthAuditLogPage } from './fetchAuthAuditLogs.js'
import { mapLedgerRowToAuthEvent, queryLocalAuditLogsPage } from './auditLogsLedger.js'

function instituteAuditDedupeKey(raw, source) {
  const activity = String(raw?.activityType || '').toUpperCase()
  const eventType = String(raw?.eventType || raw?.type || '').toLowerCase()
  if (activity === 'USER_ACCOUNT_CHANGED' || eventType === 'user_account_changed') {
    const p = raw?.eventData || raw?.details || raw?.payload || {}
    const targetId = String(p.targetUserId || p.userId || raw.userId || '').trim()
    const ms = pickAuditEventDate(raw)?.getTime() ?? NaN
    const bucket = Number.isFinite(ms) ? Math.floor(ms / 2000) : 0
    return `user_account_changed:${targetId}:${bucket}`
  }
  return String(
    raw?.id ||
      `${source}:${raw?.eventType || raw?.type || raw?.activityType}:${raw?.timestamp || raw?.createdAt}:${raw?.userId}`,
  )
}

const PAGE_SIZE = 200
const MAX_PAGES = 15

/**
 * Page institute-wide audit sources for dashboard statistics (last 7 days).
 *
 * @param {{
 *   auth: import('better-auth').Auth,
 *   headers: import('better-auth').Headers,
 *   sessionUserId?: string,
 * }} ctx
 */
export async function loadInstituteAuditEventsForStatistics(ctx) {
  const weekAgo = new Date()
  weekAgo.setDate(weekAgo.getDate() - 7)
  weekAgo.setHours(0, 0, 0, 0)
  const dateFrom = toAuditIsoDate(weekAgo.toISOString(), false)

  const collected = []
  const seen = new Set()

  const pushUnique = (events, source) => {
    for (const raw of events) {
      const key = instituteAuditDedupeKey(raw, source)
      if (seen.has(key)) continue
      seen.add(key)
      collected.push({ ...raw, source: raw?.source || source })
    }
  }

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE
    const lms = await queryLmsAuditLogsWithTargets({
      limit: PAGE_SIZE,
      offset,
      dateFrom,
    })
    const batch = Array.isArray(lms?.events) ? lms.events : []
    pushUnique(batch, 'lms')
    if (batch.length < PAGE_SIZE) break
  }

  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE
    const local = await queryLocalAuditLogsPage({
      limit: PAGE_SIZE,
      offset,
      dateFrom,
    })
    const batch = (Array.isArray(local?.events) ? local.events : []).map((row) =>
      row?.eventType ? row : mapLedgerRowToAuthEvent(row),
    )
    pushUnique(batch, 'ledger')
    if (batch.length < PAGE_SIZE) break
  }

  const userId = String(ctx.sessionUserId || '').trim()
  if (userId && ctx.auth) {
    for (let page = 0; page < MAX_PAGES; page++) {
      const offset = page * PAGE_SIZE
      const authPage = await fetchAuthAuditLogPage({
        auth: ctx.auth,
        headers: ctx.headers,
        userId,
        limit: PAGE_SIZE,
        offset,
        dateFrom,
      })
      const batch = Array.isArray(authPage?.events) ? authPage.events : []
      pushUnique(batch, 'auth')
      if (batch.length < PAGE_SIZE) break
    }
  }

  return collected
}

/**
 * @param {{
 *   auth: import('better-auth').Auth,
 *   headers: import('better-auth').Headers,
 *   sessionUserId?: string,
 * }} ctx
 */
export async function getInstituteAuditStatistics(ctx) {
  const collected = await loadInstituteAuditEventsForStatistics(ctx)
  return computeAuditStatistics(collected)
}
