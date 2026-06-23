import { cleanAuditLogEvents } from '../lib/cleanAuditLogText.js'
import {
  enrichAuthAuditEvents,
  fetchFilteredAuthAuditLogs,
  parseAuditLogQuery,
  pickAuditEventTime,
  queryLmsAuditLogsWithTargets,
  toAuditIsoDate,
} from '../api/logs.js'
import { fetchAuthAuditLogPage, logAuditInfraError } from '../lib/fetchAuthAuditLogs.js'
import { queryLocalAuditLogsPage, AUDIT_LOGS_CLEARED_TYPE } from '../lib/auditLogsLedger.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { getInstituteAuditStatistics } from '../lib/auditStatisticsService.js'
import { pickAuditEventDate } from '../../shared/auditTime.js'
import { sendSafeServerError } from '../lib/safeApiError.js'

function pickTime(e) {
  return pickAuditEventTime(e)
}

function normalizeDashEvent(raw) {
  return cleanAuditLogEvents([
    {
      ...raw,
      source: 'auth',
      timestamp: pickTime(raw),
    },
  ])[0]
}

function normalizeLmsEvent(raw) {
  return cleanAuditLogEvents([
    {
      ...raw,
      source: 'lms',
      timestamp: raw?.timestamp || pickTime(raw),
    },
  ])[0]
}

function normalizeLedgerEvent(raw) {
  return cleanAuditLogEvents([
    {
      ...raw,
      source: 'ledger',
      eventType: raw?.eventType || raw?.type || '',
      timestamp: pickTime(raw),
    },
  ])[0]
}

function eventSortMs(e) {
  return pickAuditEventDate(e)?.getTime() ?? new Date(pickTime(e) || 0).getTime() ?? 0
}

/** Collapse ledger + LMS duplicates from the same save (same target, ~2s window). */
function unifiedEventDedupeKey(e) {
  const activity = String(e?.activityType || '').toUpperCase()
  const eventType = String(e?.eventType || e?.type || '').toLowerCase()
  const isAccountChanged =
    activity === 'USER_ACCOUNT_CHANGED' || eventType === 'user_account_changed'
  if (!isAccountChanged) {
    const id = String(e?.id || '').trim()
    if (id) {
      return `${e?.source || 'unknown'}:${id}:${eventSortMs(e)}:${eventType || activity}`
    }
    return `${e?.source}:${pickTime(e)}:${eventType || activity}`
  }
  const ed = e?.eventData || e?.details || {}
  const targetId = String(
    ed?.targetUserId || ed?.payload?.targetUserId || ed?.userId || e?.userId || '',
  ).trim()
  const ms = eventSortMs(e)
  const bucket = Number.isFinite(ms) ? Math.floor(ms / 2000) : 0
  return `user_account_changed:${targetId}:${bucket}`
}

function csvEscape(v) {
  const s = String(v ?? '')
  if (/[,"\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function toCsv(rows) {
  return rows.map((r) => r.map(csvEscape).join(',')).join('\n')
}

function isBetween(ms, fromMs, toMs) {
  if (!Number.isFinite(ms)) return true
  if (Number.isFinite(fromMs) && ms < fromMs) return false
  if (Number.isFinite(toMs) && ms > toMs) return false
  return true
}

function classifyAuthEventType(eventType) {
  const t = String(eventType || '').toLowerCase()
  if (!t) return 'other'
  if (t.startsWith('security_')) return 'security'
  if (t.includes('ban') || t.includes('delete') || t.includes('role') || t.includes('permission') || t.includes('admin') || t.includes('config')) return 'admin'
  if (t.includes('export') || t.includes('view') || t.includes('read') || t.includes('access')) return 'data_access'
  if (t.includes('sign_in') && t.includes('fail')) return 'security'
  if (t.includes('lock')) return 'security'
  return 'auth'
}

function classifyLmsActivityType(activityType) {
  const t = String(activityType || '').toUpperCase()
  if (!t) return 'other'
  if (t.includes('PROFILE') || t.includes('USER_PROFILE')) return 'admin'
  if (t.includes('EXPORTED')) return 'data_access'
  if (t.includes('ACCESSED') || t.includes('VIEWED')) return 'data_access'
  if (t.includes('UPLOADED') || t.includes('POSTED')) return 'admin'
  return 'lms'
}

function reportTypeMatches(classification, reportType) {
  const rt = String(reportType || 'all').toLowerCase()
  if (rt === 'all' || !rt) return true
  if (rt === 'admin_actions') return classification === 'admin'
  if (rt === 'data_access') return classification === 'data_access'
  if (rt === 'security_events') return classification === 'security'
  return true
}

function httpStatusFromError(e, fallback = 500) {
  const candidates = [e?.status, e?.statusCode, e?.code].filter((v) => v !== undefined)
  for (const c of candidates) {
    const n = Number(c)
    if (Number.isFinite(n) && n >= 100 && n <= 599) return n
  }
  return fallback
}

export function createMonitoringRouter(express, auth) {
  const router = express.Router()

  async function requireAdmin(req) {
    const out = await auth.api.getSession({ headers: req.headers })
    const role = out?.user?.role || out?.data?.user?.role || out?.session?.user?.role
    if (role !== 'admin') {
      const err = new Error('Admins only')
      err.status = 403
      throw err
    }
    return out
  }

  /**
   * GET /api/monitoring/auth-audit-logs
   * Query: limit, offset, eventType, userId
   * Response: { events: [...], total, limit, offset }
   *
   * Uses Better Auth Infrastructure directly (bypasses dash() plugin) to avoid
   * intermittent / opaque 500s while still honoring the current session.
   */
  router.get('/monitoring/auth-audit-logs', async (req, res) => {
    try {
      const session = await requireAdmin(req)
      const sessionUserId = session?.user?.id || session?.data?.user?.id

      const role = String(session?.user?.role || session?.data?.user?.role || '').trim().toLowerCase()
      const requestedUserId = req.query.userId ? String(req.query.userId).trim() : ''
      if (requestedUserId && requestedUserId !== sessionUserId && role !== 'admin') {
        res.status(403).json({ error: 'FORBIDDEN', message: "Not allowed to access another user's audit logs" })
        return
      }
      const userId = requestedUserId || sessionUserId
      const filters = parseAuditLogQuery(req.query)
      filters.limit = Math.min(100, filters.limit)
      filters.userId = userId

      let result
      let dataSource = 'dash'
      let latestPageSource = 'dash'
      try {
        result = await fetchFilteredAuthAuditLogs(
          ({ limit: pageLimit, offset: pageOffset }) =>
            fetchAuthAuditLogPage({
              auth,
              headers: req.headers,
              userId,
              limit: pageLimit,
              offset: pageOffset,
              eventType: filters.eventType,
              dateFrom: filters.dateFrom,
              dateTo: filters.dateTo,
              search: filters.search,
            }).then((page) => {
              latestPageSource = page?.source || latestPageSource
              return page
            }),
          filters,
        )
        dataSource = latestPageSource
      } catch (e) {
        logAuditInfraError(e, 'monitoring/auth-audit-logs')
        const local = await queryLocalAuditLogsPage({
          ...filters,
          userId,
        })
        result = {
          events: local.events,
          total: local.total,
          limit: local.limit,
          offset: local.offset,
        }
        dataSource = 'local_fallback'
      }

      res.json({
        events: result.events.map(normalizeDashEvent),
        total: result.total,
        limit: result.limit,
        offset: result.offset,
        source: dataSource,
        localFallback: dataSource === 'local_fallback',
        success: true,
      })
    } catch (e) {
      const code = httpStatusFromError(e, 500)
      if (code === 500) {
        try {
          const local = await queryLocalAuditLogsPage(parseAuditLogQuery(req.query))
          return res.status(200).json({
            success: true,
            events: local.events.map(normalizeDashEvent),
            total: local.total,
            limit: local.limit,
            offset: local.offset,
            source: 'local_fallback',
            localFallback: true,
            warning: 'Primary audit source unavailable; showing local ledger.',
          })
        } catch (ledgerErr) {
          console.error('[monitoring] ledger fallback failed:', ledgerErr?.message || ledgerErr)
        }
      }
      sendSafeServerError(res, e, 'GET /api/monitoring/auth-audit-logs')
    }
  })

  /**
   * GET /api/monitoring/lms-activity
   * Query: userId, activityType, dateFrom, dateTo, limit, offset
   * Response: { events: [...], total, limit, offset }
   */
  router.get('/monitoring/lms-activity', async (req, res) => {
    try {
      await requireAdmin(req)
      const filters = parseAuditLogQuery(req.query)

      const result = await queryLmsAuditLogsWithTargets({
        ...filters,
        userId: filters.userId || undefined,
        activityType: filters.activityType || undefined,
        dateFrom: filters.dateFrom || undefined,
        dateTo: filters.dateTo || undefined,
        search: filters.search || undefined,
      })

      res.json({
        ...result,
        events: cleanAuditLogEvents(result?.events),
      })
    } catch (e) {
      const code = httpStatusFromError(e, 500)
      sendSafeServerError(res, e, 'GET /api/monitoring/lms-activity-logs')
    }
  })

  /**
   * GET /api/monitoring/unified
   * Query: limit, offset, eventType, userId, activityType, dateFrom, dateTo
   * Response: { events: [...], total }
   */
  router.get('/monitoring/unified', async (req, res) => {
    try {
      await requireAdmin(req)
      const filters = parseAuditLogQuery(req.query)
      filters.limit = Math.max(1, Math.min(200, filters.limit))

      const session = await auth.api.getSession({ headers: req.headers })
      const sessionUserId = session?.user?.id || session?.data?.user?.id
      const explicitUserId = String(filters.userId || '').trim()
      const authUserId = explicitUserId || sessionUserId

      const isProfileEventFilter =
        filters.eventType === 'profile_updated' ||
        filters.eventType === 'user_profile_updated' ||
        filters.eventType === 'user_account_changed'
      const ledgerFilter = String(filters.activityType || filters.eventType || '')
        .trim()
        .toLowerCase()
      const isLedgerMutationFilter =
        ledgerFilter === AUDIT_LOGS_CLEARED_TYPE ||
        ledgerFilter === 'audit_cleared' ||
        ledgerFilter === 'auth_lockout'
      const includeAuth = !filters.activityType || isProfileEventFilter
      const includeLms = !filters.eventType || isProfileEventFilter
      const includeLedger =
        !filters.activityType ||
        isProfileEventFilter ||
        String(filters.activityType || '').toUpperCase() === 'USER_ACCOUNT_CHANGED' ||
        isLedgerMutationFilter

      let authEvents = []
      let authTotal = 0
      let authSource = 'dash'
      if (includeAuth) {
        try {
          let latestAuthSource = 'dash'
          const authResult = await fetchFilteredAuthAuditLogs(
            ({ limit: pageLimit, offset: pageOffset }) =>
              fetchAuthAuditLogPage({
                auth,
                headers: req.headers,
                userId: authUserId,
                limit: pageLimit,
                offset: pageOffset,
                eventType: filters.eventType,
                dateFrom: filters.dateFrom,
                dateTo: filters.dateTo,
                search: filters.search,
              }).then((page) => {
                latestAuthSource = page?.source || latestAuthSource
                return page
              }),
            { ...filters, userId: authUserId },
          )
          authEvents = authResult.events.map(normalizeDashEvent)
          authTotal = authResult.total
          authSource = latestAuthSource
        } catch (authErr) {
          logAuditInfraError(authErr, 'monitoring/unified')
        }
      }

      let lmsEvents = []
      let lmsTotal = 0
      if (includeLms) {
        const fetchLimit = includeAuth || includeLedger ? filters.limit + filters.offset : filters.limit
        const fetchOffset = includeAuth || includeLedger ? 0 : filters.offset
        const lms = await queryLmsAuditLogsWithTargets({
          ...filters,
          userId: explicitUserId || undefined,
          limit: fetchLimit,
          offset: fetchOffset,
          activityType: isProfileEventFilter ? undefined : filters.activityType || undefined,
          matchProfileUpdates: isProfileEventFilter,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          search: filters.search || undefined,
        })
        lmsEvents = lms.events.map(normalizeLmsEvent)
        lmsTotal = lms.total
      }

      let ledgerEvents = []
      let ledgerTotal = 0
      if (includeLedger) {
        const fetchLimit = filters.limit + filters.offset
        const ledger = await queryLocalAuditLogsPage({
          limit: fetchLimit,
          offset: 0,
          eventType: filters.eventType || undefined,
          userId: explicitUserId || undefined,
          dateFrom: filters.dateFrom || undefined,
          dateTo: filters.dateTo || undefined,
          search: filters.search || undefined,
          module: filters.module || undefined,
          action: filters.action || undefined,
          performedByName: filters.performedByName || undefined,
          targetLabel: filters.targetLabel || undefined,
        })
        ledgerEvents = (ledger.events || []).map(normalizeLedgerEvent)
        ledgerTotal = ledger.total
      }

      const seen = new Set()
      const mergedAll = []
      for (const e of [...lmsEvents, ...ledgerEvents, ...authEvents]) {
        const key = unifiedEventDedupeKey(e)
        if (seen.has(key)) continue
        seen.add(key)
        mergedAll.push(e)
      }
      mergedAll.sort((a, b) => eventSortMs(b) - eventSortMs(a))

      const merged = mergedAll.slice(filters.offset, filters.offset + filters.limit)
      // Local PostgreSQL counts (lms_activity_logs + audit_logs); avoid summing auth Infra total on top.
      const total = Math.max(mergedAll.length, lmsTotal + ledgerTotal)

      res.json({
        events: merged,
        total,
        limit: filters.limit,
        offset: filters.offset,
        authSource,
        localFallback: authSource === 'local_fallback',
      })
    } catch (e) {
      const code = httpStatusFromError(e, 500)
      sendSafeServerError(res, e, 'GET /api/monitoring/unified')
    }
  })

  /**
   * GET /api/monitoring/audit-statistics
   * Institute-wide counts from LMS activity, local audit ledger, and session auth events.
   */
  router.get('/monitoring/audit-statistics', async (req, res) => {
    try {
      const session = await requireAdmin(req)
      const sessionUserId = session?.user?.id || session?.data?.user?.id
      const stats = await getInstituteAuditStatistics({
        auth,
        headers: req.headers,
        sessionUserId,
      })
      res.json(stats)
    } catch (e) {
      const code = httpStatusFromError(e, 500)
      sendSafeServerError(res, e, 'GET /api/monitoring/audit-statistics')
    }
  })

  /**
   * GET /api/monitoring/compliance-report
   * Query: dateFrom, dateTo, reportType
   *
   * Returns CSV:
   * Timestamp, Admin Email, Action, Target User, Resource, Details
   */
  router.get('/monitoring/compliance-report', async (req, res) => {
    try {
      await requireAdmin(req)
      const reportType = String(req.query.reportType || 'all')
      const dateFromIso = toAuditIsoDate(req.query.dateFrom ?? req.query.startDate, false)
      const dateToIso = toAuditIsoDate(req.query.dateTo ?? req.query.endDate, true)
      const fromMs = dateFromIso ? new Date(dateFromIso).getTime() : NaN
      const toMs = dateToIso ? new Date(dateToIso).getTime() : NaN

      // ---- Fetch auth audit logs (page until we fall outside range or hit cap) ----
      const authEvents = []
      const pageLimit = 200
      const maxPages = 10 // up to 2000 auth events
      for (let page = 0; page < maxPages; page++) {
        const dash = await auth.api.getAuditLogs({
          headers: req.headers,
          query: { limit: pageLimit, offset: page * pageLimit },
        })
        const batch = Array.isArray(dash?.events)
          ? dash.events
          : Array.isArray(dash?.data?.events)
            ? dash.data.events
            : []
        if (batch.length === 0) break

        for (const e of batch) {
          const ts = pickTime(e)
          const ms = ts ? new Date(ts).getTime() : NaN
          if (!isBetween(ms, fromMs, toMs)) continue
          authEvents.push(e)
        }

        // stop if the oldest item is already older than dateFrom (assuming descending order)
        const last = batch[batch.length - 1]
        const lastMs = pickTime(last) ? new Date(pickTime(last)).getTime() : NaN
        if (Number.isFinite(fromMs) && Number.isFinite(lastMs) && lastMs < fromMs) break
      }

      // ---- Fetch LMS activity logs ----
      const lmsCollected = []
      const lmsPageLimit = 500
      const lmsMaxPages = 10 // up to 5000 events
      for (let page = 0; page < lmsMaxPages; page++) {
        const out = await customActivityLogger.queryLogs({
          limit: lmsPageLimit,
          offset: page * lmsPageLimit,
          dateFrom: dateFromIso || undefined,
          dateTo: dateToIso || undefined,
        })
        const batch = Array.isArray(out?.events) ? out.events : []
        if (batch.length === 0) break
        lmsCollected.push(...batch.map(normalizeLmsEvent))
        if (batch.length < lmsPageLimit) break
      }

      const authEventsEnriched = (await enrichAuthAuditEvents(authEvents)).map(normalizeDashEvent)

      // ---- Filter + normalize rows for CSV ----
      const rows = [
        ['Timestamp', 'Admin Email', 'Action', 'Target User', 'Resource', 'Details'],
      ]

      const allEvents = [...authEventsEnriched, ...lmsCollected].sort(
        (a, b) => new Date(pickTime(b) || 0) - new Date(pickTime(a) || 0),
      )

      for (const e of allEvents) {
        if (e.source === 'auth') {
          const action = String(e.eventType || e.type || e.event || 'AUTH_EVENT')
          const classification = classifyAuthEventType(action)
          if (!reportTypeMatches(classification, reportType)) continue

          const actorEmail =
            e?.user?.email ||
            e?.actor?.email ||
            e?.account?.email ||
            e?.principal?.email ||
            e?.email ||
            ''
          const targetUser =
            e?.targetName ||
            e?.targetEmail ||
            e?.targetUserEmail ||
            e?.target?.email ||
            e?.target?.name ||
            e?.detailsObj?.targetName ||
            e?.detailsObj?.targetEmail ||
            e?.details?.targetName ||
            e?.details?.targetEmail ||
            e?.details?.targetUserEmail ||
            e?.details?.targetUserId ||
            ''
          const resource =
            e?.resourceId ||
            e?.resource ||
            e?.details?.resourceId ||
            e?.details?.path ||
            ''

          rows.push([
            String(pickTime(e) || ''),
            actorEmail,
            action,
            String(targetUser || ''),
            String(resource || ''),
            JSON.stringify(e?.details || e?.metadata || e?.data || e || {}),
          ])
        } else if (e.source === 'lms') {
          const action = String(e.activityType || 'LMS_ACTIVITY')
          const classification = classifyLmsActivityType(action)
          if (!reportTypeMatches(classification, reportType)) continue

          const actorEmail = e.userEmail || ''
          const resource = e.resourceId || ''
          const details = e.details || e.detailsObj || {}
          const targetUser =
            e.targetName ||
            e.targetEmail ||
            details.targetName ||
            details.targetEmail ||
            ''
          rows.push([
            String(pickTime(e) || e.timestamp || ''),
            actorEmail,
            action,
            String(targetUser || ''),
            String(resource || ''),
            JSON.stringify(details || e || {}),
          ])
        }
      }

      const csv = toCsv(rows)
      const safeType = reportType.replace(/[^a-z0-9_-]+/gi, '_')
      const nameFrom = dateFromIso ? dateFromIso.slice(0, 10) : 'all'
      const nameTo = dateToIso ? dateToIso.slice(0, 10) : 'all'
      const filename = `lenlearn-ra10173-${safeType}-${nameFrom}-to-${nameTo}.csv`

      res.setHeader('Content-Type', 'text/csv; charset=utf-8')
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
      res.status(200).send(csv)
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/monitoring/compliance-report')
    }
  })

  return router
}

