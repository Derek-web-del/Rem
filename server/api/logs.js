import { pickAuditEventDate } from '../../shared/auditTime.js'
import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireSuperAdminSession } from '../lib/security.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import {
  AUDIT_LOGS_CLEARED_TYPE,
  countAuditLogsForClear,
  deleteAuditLogsForClear,
  insertAuditLogRecord,
  parseAuditClearParams,
} from '../lib/auditLogsLedger.js'
import {
  AUTH_PROFILE_UPDATE_DISPLAY_TYPE,
  PROFILE_UPDATE_DISPLAY_TYPE,
  USER_ACCOUNT_CHANGED_EVENT_TYPE,
  parseUpdatedFieldsArray,
} from '../lib/profileAudit.js'

/** Dropdown / API tokens → all Infra event_type values that should match. */
export const AUTH_EVENT_TYPE_ALIASES = {
  profile_updated: ['profile_updated', 'user_profile_updated', USER_ACCOUNT_CHANGED_EVENT_TYPE],
  user_account_changed: [USER_ACCOUNT_CHANGED_EVENT_TYPE],
  profile_image_updated: ['profile_image_updated', 'user_profile_image_updated'],
  user_created: ['user_created', 'user_signed_up'],
}

const LMS_JOIN_SQL = `
  LEFT JOIN "user" actor_user
    ON actor_user.id = NULLIF(TRIM(logs.details->>'actorUserId'), '')
  LEFT JOIN "user" target_user
    ON target_user.id = COALESCE(
      NULLIF(TRIM(logs.details->>'targetUserId'), ''),
      logs."userId"
    )
`

export function pickAuditEventTime(e) {
  const d = pickAuditEventDate(e)
  if (d) return d.toISOString()
  const raw =
    e?.time || e?.timestamp || e?.createdAt || e?.created_at || e?.occurredAt || e?.occurred_at
  return raw ?? null
}

/** Normalize date query values; end date includes 23:59:59.999 on calendar day. */
export function toAuditIsoDate(value, endOfDay = false) {
  if (value == null || value === '') return ''
  const raw = String(value).trim()
  if (!raw) return ''
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}`)
    return Number.isNaN(d.getTime()) ? '' : d.toISOString()
  }
  const d = new Date(raw)
  if (Number.isNaN(d.getTime())) return ''
  if (endOfDay) {
    d.setHours(23, 59, 59, 999)
  }
  return d.toISOString()
}

export function parseAuditLogQuery(query = {}) {
  const dateFrom = toAuditIsoDate(query.dateFrom ?? query.startDate, false)
  const dateTo = toAuditIsoDate(query.dateTo ?? query.endDate, true)
  const search = String(query.search ?? query.q ?? '').trim().slice(0, 200)
  const eventType = String(query.eventType ?? query.event ?? '').trim()
  const activityType = String(query.activityType ?? '').trim()
  const userId = String(query.userId ?? '').trim()
  const module = String(query.module ?? '').trim()
  const action = String(query.action ?? '').trim()
  const performedByName = String(query.performedByName ?? query.teacherName ?? '').trim().slice(0, 200)
  const targetLabel = String(query.targetLabel ?? '').trim().slice(0, 200)
  const limit = Math.max(1, Math.min(500, Number(query.limit || 50)))
  const offset = Math.max(0, Number(query.offset || 0))
  return { dateFrom, dateTo, search, eventType, activityType, userId, module, action, performedByName, targetLabel, limit, offset }
}

export function expandAuthEventTypes(eventType) {
  const key = String(eventType || '').trim()
  if (!key || key === 'all') return []
  return AUTH_EVENT_TYPE_ALIASES[key] || [key]
}

export function authEventMatchesType(event, eventType) {
  if (!eventType) return true
  const actual = String(event?.eventType || event?.event_type || event?.type || '').trim()
  return expandAuthEventTypes(eventType).includes(actual)
}

export function authEventInDateRange(event, dateFrom, dateTo) {
  const d = pickAuditEventDate(event)
  if (!d) return !dateFrom && !dateTo
  const ms = d.getTime()
  if (Number.isNaN(ms)) return true
  if (dateFrom) {
    const fromMs = new Date(dateFrom).getTime()
    if (!Number.isNaN(fromMs) && ms < fromMs) return false
  }
  if (dateTo) {
    const toMs = new Date(dateTo).getTime()
    if (!Number.isNaN(toMs) && ms > toMs) return false
  }
  return true
}

export function authEventMatchesSearch(event, search) {
  const needle = String(search || '').trim().toLowerCase()
  if (!needle) return true
  const ed = event?.eventData ?? event?.details ?? event?.metadata ?? {}
  const haystack = [
    event?.eventType,
    event?.event_type,
    event?.type,
    ed?.userName,
    ed?.userEmail,
    ed?.targetName,
    ed?.targetEmail,
    ed?.identifier,
    event?.targetName,
    event?.targetEmail,
    event?.user?.name,
    event?.user?.email,
    event?.email,
    pickAuditEventTime(event),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
  return haystack.includes(needle)
}

function sanitizeIlikeTerm(search) {
  return String(search || '')
    .trim()
    .replace(/[%_\\]/g, '')
    .slice(0, 200)
}

function parseDetailsColumn(rawDetails) {
  if (rawDetails == null) return null
  if (typeof rawDetails === 'object') return rawDetails
  try {
    return JSON.parse(String(rawDetails))
  } catch {
    return { _error: 'details_parse_failed' }
  }
}

function mergeActorTargetFromJoin(detailsParsed, row) {
  const details = detailsParsed && typeof detailsParsed === 'object' ? { ...detailsParsed } : {}
  const joinedTargetName = row?.targetName != null ? String(row.targetName).trim() : ''
  const joinedTargetEmail = row?.targetEmail != null ? String(row.targetEmail).trim() : ''
  const joinedActorName = row?.actorName != null ? String(row.actorName).trim() : ''
  const joinedActorEmail = row?.actorEmail != null ? String(row.actorEmail).trim() : ''
  const joinedActorRole = row?.actorRole != null ? String(row.actorRole).trim() : ''

  if (!String(details.targetName || '').trim() && joinedTargetName) details.targetName = joinedTargetName
  if (!String(details.targetEmail || '').trim() && joinedTargetEmail) details.targetEmail = joinedTargetEmail
  if (!String(details.actorEmail || '').trim() && joinedActorEmail) details.actorEmail = joinedActorEmail
  if (!String(details.actorRole || '').trim() && joinedActorRole) details.actorRole = joinedActorRole
  if (!String(details.actorName || '').trim() && joinedActorName) details.actorName = joinedActorName

  details.updatedFields = parseUpdatedFieldsArray(details)

  return {
    details,
    actorName: details.actorName || joinedActorName || null,
    actorEmail: details.actorEmail || joinedActorEmail || null,
    actorRole: details.actorRole || joinedActorRole || null,
    targetName: details.targetName || joinedTargetName || null,
    targetEmail: details.targetEmail || joinedTargetEmail || null,
    updatedFields: details.updatedFields,
  }
}

function mapLmsAuditRow(r) {
  const detailsParsed = parseDetailsColumn(r.details)
  const merged = mergeActorTargetFromJoin(detailsParsed, r)
  return {
    id: r.id,
    userId: r.userId,
    userEmail: r.userEmail,
    userRole: r.userRole,
    activityType: r.activityType,
    resourceId: r.resourceId,
    details: merged.details,
    actorName: merged.actorName,
    actorEmail: merged.actorEmail,
    actorRole: merged.actorRole,
    targetName: merged.targetName,
    targetEmail: merged.targetEmail,
    updatedFields: merged.updatedFields,
    timestamp: r.timestamp,
    source: 'lms',
  }
}

function buildLmsWhereClause(filters) {
  const where = []
  const params = []
  let p = 1

  if (filters.userId) {
    where.push(`logs."userId" = $${p++}`)
    params.push(String(filters.userId))
  }
  if (filters.matchProfileUpdates) {
    where.push(`(
      logs."activityType" IN ('USER_PROFILE_UPDATED', 'USER_ACCOUNT_CHANGED')
      OR logs.details->>'type' IN ($${p}, $${p + 1}, $${p + 2})
      OR logs.details->>'eventType' = $${p + 2}
    )`)
    params.push(
      AUTH_PROFILE_UPDATE_DISPLAY_TYPE,
      PROFILE_UPDATE_DISPLAY_TYPE,
      USER_ACCOUNT_CHANGED_EVENT_TYPE,
    )
    p += 3
  } else if (filters.activityType) {
    where.push(`logs."activityType" = $${p++}`)
    params.push(String(filters.activityType))
  }
  if (filters.dateFrom) {
    where.push(`logs."timestamp" >= $${p++}`)
    params.push(String(filters.dateFrom))
  }
  if (filters.dateTo) {
    where.push(`logs."timestamp" <= $${p++}`)
    params.push(String(filters.dateTo))
  }
  const searchTerm = sanitizeIlikeTerm(filters.search)
  if (searchTerm) {
    const pattern = `%${searchTerm}%`
    where.push(`(
      logs."userEmail" ILIKE $${p}
      OR logs."activityType" ILIKE $${p}
      OR logs."userId" ILIKE $${p}
      OR logs.details::text ILIKE $${p}
      OR actor_user.name ILIKE $${p}
      OR actor_user.email ILIKE $${p}
      OR target_user.name ILIKE $${p}
      OR target_user.email ILIKE $${p}
    )`)
    params.push(pattern)
    p++
  }

  return { whereSql: where.length ? `WHERE ${where.join(' AND ')}` : '', params, nextParam: p }
}

/**
 * LMS audit rows with target profile resolved via Better Auth `"user"`.
 */
export async function queryLmsAuditLogsWithTargets(filters = {}) {
  const pool = getPgPool()
  const limit = Math.max(1, Math.min(500, Number(filters.limit || 50)))
  const offset = Math.max(0, Number(filters.offset || 0))

  if (!pool) {
    return { events: [], total: 0, limit, offset }
  }

  const parsed = {
    ...filters,
    dateFrom: filters.dateFrom ? toAuditIsoDate(filters.dateFrom, false) : '',
    dateTo: filters.dateTo ? toAuditIsoDate(filters.dateTo, true) : '',
  }

  const { whereSql, params, nextParam } = buildLmsWhereClause(parsed)
  const fromSql = `FROM lms_activity_logs logs ${LMS_JOIN_SQL}`

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt ${fromSql} ${whereSql}`,
    params,
  )

  const { rows } = await pool.query(
    `
    SELECT
      logs.id,
      logs."userId",
      logs."userEmail",
      logs."userRole",
      logs."activityType",
      logs."resourceId",
      logs.details,
      logs."timestamp",
      actor_user.name AS "actorName",
      actor_user.email AS "actorEmail",
      actor_user.role AS "actorRole",
      target_user.name AS "targetName",
      target_user.email AS "targetEmail"
    ${fromSql}
    ${whereSql}
    ORDER BY logs."timestamp" DESC
    LIMIT $${nextParam} OFFSET $${nextParam + 1}
    `,
    [...params, limit, offset],
  )

  const total = Number(countRows[0]?.cnt || 0)
  const events = (Array.isArray(rows) ? rows : []).map(mapLmsAuditRow)
  return { events, total, limit, offset }
}

/**
 * Page through Infra auth audit logs and apply event / date / search filters server-side.
 */
export async function fetchFilteredAuthAuditLogs(fetchPage, filters, { maxPages = 20, pageSize = 200 } = {}) {
  const { eventType, search, dateFrom, dateTo, limit, offset } = filters
  const needsScan = !!(eventType || search || dateFrom || dateTo)

  if (!needsScan) {
    const out = await fetchPage({ limit, offset })
    const events = await enrichAuthAuditEvents(Array.isArray(out?.events) ? out.events : [])
    return {
      events,
      total: Number(out?.total ?? events.length ?? 0),
      limit,
      offset,
    }
  }

  const collected = []
  let infraTotal = 0

  for (let page = 0; page < maxPages; page++) {
    const out = await fetchPage({ limit: pageSize, offset: page * pageSize })
    const batch = Array.isArray(out?.events) ? out.events : []
    infraTotal = Number(out?.total ?? infraTotal)
    if (batch.length === 0) break

    for (const e of batch) {
      if (!authEventMatchesType(e, eventType)) continue
      if (!authEventInDateRange(e, dateFrom, dateTo)) continue
      if (!authEventMatchesSearch(e, search)) continue
      collected.push(e)
    }

    if (batch.length < pageSize) break

    if (dateFrom) {
      const last = batch[batch.length - 1]
      const lastMs = pickAuditEventDate(last)?.getTime() ?? NaN
      const fromMs = new Date(dateFrom).getTime()
      if (Number.isFinite(fromMs) && Number.isFinite(lastMs) && lastMs < fromMs) break
    }
  }

  const enriched = await enrichAuthAuditEvents(collected)
  const total = enriched.length
  const events = enriched.slice(offset, offset + limit)
  return { events, total: Math.max(total, infraTotal > 0 ? total : 0), limit, offset }
}

export async function findAuthUserIdByEmail(email) {
  const pool = getPgPool()
  const e = String(email || '').trim().toLowerCase()
  if (!pool || !e) return null
  const { rows } = await pool.query(
    `SELECT id FROM "user" WHERE LOWER(email) = LOWER($1) LIMIT 1`,
    [e],
  )
  return rows?.[0]?.id ? String(rows[0].id) : null
}

export async function findAuthUserIdByUsername(username) {
  const pool = getPgPool()
  const u = String(username || '').trim().toLowerCase()
  if (!pool || !u) return null
  const { rows } = await pool.query(
    `SELECT id FROM "user" WHERE LOWER(username) = LOWER($1) LIMIT 1`,
    [u],
  )
  return rows?.[0]?.id ? String(rows[0].id) : null
}

export async function fetchAuthUsersByIds(ids) {
  const pool = getPgPool()
  const unique = [...new Set(ids.map((id) => String(id || '').trim()).filter(Boolean))]
  if (!pool || unique.length === 0) return new Map()

  const { rows } = await pool.query(
    `SELECT id, name, email, role FROM "user" WHERE id = ANY($1::text[])`,
    [unique],
  )
  return new Map(
    (rows || []).map((r) => [String(r.id), { name: r.name, email: r.email, role: r.role }]),
  )
}

/** Full `user` row snapshot for pre-update profile audit diffs. */
export async function fetchAuthUserSnapshotForAudit(userId) {
  const pool = getPgPool()
  const id = String(userId || '').trim()
  if (!pool || !id) return null
  try {
    const { rows } = await pool.query(`SELECT * FROM "user" WHERE id = $1 LIMIT 1`, [id])
    return rows?.[0] || null
  } catch {
    return null
  }
}

function collectTargetUserIdsFromAuthEvent(e) {
  const ids = []
  const ed = e?.eventData ?? e?.details ?? e?.metadata ?? {}
  const tid = ed?.targetUserId ?? e?.targetUserId
  if (tid) ids.push(String(tid))
  const uid = e?.userId ?? e?.user?.id ?? ed?.userId
  const type = String(e?.eventType || e?.event_type || e?.type || '').toLowerCase()
  if (uid && (type.includes('profile') || type.includes('user_updated') || type.includes('update_user'))) {
    ids.push(String(uid))
  }
  return ids
}

/** Resolve null targetName / targetEmail on Better Auth Infra audit events. */
export async function enrichAuthAuditEvents(events) {
  if (!Array.isArray(events) || events.length === 0) return events

  const idSet = new Set()
  for (const e of events) {
    for (const id of collectTargetUserIdsFromAuthEvent(e)) idSet.add(id)
  }
  if (idSet.size === 0) return events

  const usersById = await fetchAuthUsersByIds([...idSet])

  return events.map((raw) => {
    const ed = { ...(raw?.eventData ?? raw?.details ?? {}) }
    const tid = String(ed.targetUserId ?? raw.targetUserId ?? raw.userId ?? ed.userId ?? '').trim()
    const profile = tid ? usersById.get(tid) : null
    if (profile) {
      if (!String(ed.targetName || raw.targetName || '').trim() && profile.name) {
        ed.targetName = String(profile.name)
      }
      if (!String(ed.targetEmail || raw.targetEmail || '').trim() && profile.email) {
        ed.targetEmail = String(profile.email)
      }
    }
    return {
      ...raw,
      eventData: ed,
      details: ed,
      targetName: ed.targetName ?? raw.targetName ?? null,
      targetEmail: ed.targetEmail ?? raw.targetEmail ?? null,
    }
  })
}

function registerAuditClearRoutes(router, auth) {
  /**
   * GET /api/logs/audit/clear-preview
   * Query: clearType, beforeDate, fromDate, toDate
   */
  router.get('/audit/clear-preview', async (req, res) => {
    try {
      if (!(await requireAdminSession(req, res, auth))) return
      const params = parseAuditClearParams(req.query)
      const preview = await countAuditLogsForClear(params)
      res.json(preview)
    } catch (e) {
      const code = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500
      if (code === 400) {
        res.status(400).json({ error: 'BAD_REQUEST', message: String(e?.message || e) })
        return
      }
      sendSafeServerError(res, e, 'GET /api/logs/audit/clear-preview')
    }
  })

  /**
   * DELETE /api/logs/audit/clear
   * Body: { clearType, beforeDate?, fromDate?, toDate? }
   */
  router.delete('/audit/clear', async (req, res) => {
    try {
      const session = await requireAdminSession(req, res, auth)
      if (!session) return

      const params = parseAuditClearParams(req.body || {})
      const result = await deleteAuditLogsForClear(params)
      const { deleted, auditLogs, lmsActivityLogs } = result

      const actor = session?.user || session?.data?.user || {}
      await insertAuditLogRecord(AUDIT_LOGS_CLEARED_TYPE, {
        message: `Admin cleared ${deleted} local audit log entries`,
        deleted,
        auditLogs,
        lmsActivityLogs,
        clearType: params.clearType,
        beforeDate: req.body?.beforeDate ?? null,
        fromDate: req.body?.fromDate ?? null,
        toDate: req.body?.toDate ?? null,
        actorUserId: String(actor.id || '').trim(),
        actorName: String(actor.name || '').trim(),
        actorEmail: String(actor.email || '').trim(),
      })
      await auditInstituteRecord(session, 'AUDIT_LOGS_CLEARED', {
        recordType: 'audit_logs',
        description: `Audit logs cleared (${deleted} entries)`,
        details: {
          deleted,
          auditLogs,
          lmsActivityLogs,
          clearType: params.clearType,
        },
      })

      res.json({
        deleted,
        auditLogs,
        lmsActivityLogs,
        message: `${deleted} entries deleted`,
      })
    } catch (e) {
      const code = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500
      if (code === 400) {
        res.status(400).json({ error: 'BAD_REQUEST', message: String(e?.message || e) })
        return
      }
      console.error('[DELETE /api/logs/audit/clear]', e?.message || e)
      res.status(500).json({ message: 'Failed to clear logs' })
    }
  })
}

/** Admin audit-log bulk clear (mounted at /api/logs). */
export function createAuditLogsClearRouter(express, auth) {
  const router = express.Router()
  registerAuditClearRoutes(router, auth)
  router.use((_req, res) => {
    res.status(404).json({ error: 'NOT_FOUND', message: 'Logs endpoint not found.' })
  })
  return router
}

export function createLogsApiRouter(express, auth) {
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
   * GET /api/v1/audit-logs
   * Query: limit, offset, userId, activityType, eventType, dateFrom, dateTo, startDate, endDate, search, q
   */
  router.get('/v1/audit-logs', async (req, res) => {
    try {
      await requireAdmin(req)
      const filters = parseAuditLogQuery(req.query)
      const result = await queryLmsAuditLogsWithTargets(filters)
      res.json(result)
    } catch (e) {
      const code = Number(e?.status) >= 400 && Number(e?.status) < 600 ? Number(e.status) : 500
      sendSafeServerError(res, e, 'GET /api/logs')
    }
  })

  /**
   * DELETE /api/v1/audit-logs/:id — super-admin only; logs the deletion attempt.
   */
  router.delete('/v1/audit-logs/:id', async (req, res) => {
    try {
      const session = await requireSuperAdminSession(req, res, auth)
      if (!session) return
      const logId = String(req.params.id || '').trim()
      if (!logId) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Audit log id is required.' })
        return
      }
      const pool = (await import('../pgPool.js')).getPgPool()
      if (!pool) {
        res.status(503).json({ error: 'DATABASE_UNAVAILABLE' })
        return
      }
      const actor = session.user || session.data?.user || {}
      await customActivityLogger.logAuditLogDeleted(String(actor.id || ''), {
        auditLogId: logId,
        actorName: String(actor.name || ''),
        actorEmail: String(actor.email || ''),
      })
      const r = await pool.query('DELETE FROM public.audit_logs WHERE id = $1', [logId])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Audit log not found.' })
        return
      }
      res.json({ ok: true, deleted: logId })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/audit-logs/:id')
    }
  })

  return router
}
