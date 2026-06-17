import { expandAuthEventTypes, toAuditIsoDate } from '../api/logs.js'
import {
  ledgerTypeToActivityType,
  resolveLedgerDisplayType,
} from '../../shared/auditLedgerDisplay.js'
import { isGradeCriteriaAuditEvent, resolveGradeCriteriaAuditDisplay } from '../../shared/gradeCriteriaAudit.js'
import { USER_ACCOUNT_CHANGED_EVENT_TYPE } from './profileAudit.js'
import { getPgPool, isPgConfigured } from '../pgPool.js'

export const AUDIT_LOGS_CLEARED_TYPE = 'audit_logs_cleared'

const USER_ACCOUNT_CHANGED_TYPE = USER_ACCOUNT_CHANGED_EVENT_TYPE

let schemaReady = false

const AUDIT_LOGS_TEACHER_COLUMNS_DDL = `
  ALTER TABLE public.audit_logs
    ADD COLUMN IF NOT EXISTS event_type VARCHAR(128),
    ADD COLUMN IF NOT EXISTS module VARCHAR(64),
    ADD COLUMN IF NOT EXISTS action VARCHAR(32),
    ADD COLUMN IF NOT EXISTS performed_by VARCHAR(128),
    ADD COLUMN IF NOT EXISTS performed_by_name VARCHAR(512),
    ADD COLUMN IF NOT EXISTS target_id VARCHAR(128),
    ADD COLUMN IF NOT EXISTS target_label TEXT,
    ADD COLUMN IF NOT EXISTS old_values JSONB,
    ADD COLUMN IF NOT EXISTS new_values JSONB,
    ADD COLUMN IF NOT EXISTS changed_fields TEXT[],
    ADD COLUMN IF NOT EXISTS user_agent TEXT;
  CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON public.audit_logs (event_type);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON public.audit_logs (module);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.audit_logs (action);
  CREATE INDEX IF NOT EXISTS idx_audit_logs_performed_by ON public.audit_logs (performed_by);
`

export async function ensureAuditLogsSchema(pool = getPgPool()) {
  if (!pool) return
  if (schemaReady) return
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.audit_logs (
      id BIGSERIAL PRIMARY KEY,
      type VARCHAR(128) NOT NULL,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_audit_logs_type ON public.audit_logs (type);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.audit_logs (created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_payload_gin ON public.audit_logs USING gin (payload);
  `)
  await pool.query(AUDIT_LOGS_TEACHER_COLUMNS_DDL)
  schemaReady = true
}

function sanitizeIlikeTerm(search) {
  return String(search || '')
    .trim()
    .replace(/[%_\\]/g, '')
    .slice(0, 200)
}

/**
 * Map `public.audit_logs` row → Better Auth Infra–compatible event shape.
 */
export function mapLedgerRowToAuthEvent(row) {
  let payload = row?.payload
  if (payload == null) payload = {}
  if (typeof payload === 'string') {
    try {
      payload = JSON.parse(payload)
    } catch {
      payload = { _raw: payload }
    }
  }
  const p = payload && typeof payload === 'object' ? payload : {}
  const colEventType = String(row?.event_type || '').trim()
  const colModule = String(row?.module || '').trim()
  const colAction = String(row?.action || '').trim()
  const colPerformedBy = String(row?.performed_by || '').trim()
  const colPerformedByName = String(row?.performed_by_name || '').trim()
  const colTargetId = row?.target_id != null ? String(row.target_id) : ''
  const colTargetLabel = String(row?.target_label || '').trim()
  const colOldValues = row?.old_values && typeof row.old_values === 'object' ? row.old_values : null
  const colNewValues = row?.new_values && typeof row.new_values === 'object' ? row.new_values : null
  const colChangedFields = Array.isArray(row?.changed_fields) ? row.changed_fields : null
  const colUserAgent = String(row?.user_agent || '').trim()

  const userId = String(colPerformedBy || p.userId || p.performed_by || p.targetUserId || '').trim()
  const ts = row.created_at
  const ledgerType = String(row.type || colEventType || '').trim()
  const eventType = ledgerType || USER_ACCOUNT_CHANGED_EVENT_TYPE
  const activityType = ledgerTypeToActivityType(ledgerType)
  const displayType = resolveLedgerDisplayType(ledgerType, p.displayType)
  const old_values = colOldValues || p.old_values || null
  const new_values = colNewValues || p.new_values || null
  const changed_fields = colChangedFields?.length
    ? colChangedFields
    : Array.isArray(p.changed_fields)
      ? p.changed_fields
      : Array.isArray(p.updatedFields)
        ? p.updatedFields
        : []
  const resolvedEventType = colEventType || ledgerType.toLowerCase() || eventType
  let detailedDiffs = p.detailedDiffs || buildDetailedDiffs(old_values, new_values, changed_fields)
  let resolvedOldValues = old_values
  let resolvedNewValues = new_values
  let resolvedChangedFields = changed_fields

  if (
    isGradeCriteriaAuditEvent({
      event_type: resolvedEventType,
      eventType: resolvedEventType,
      type: ledgerType,
      activityType,
    })
  ) {
    const normalized = resolveGradeCriteriaAuditDisplay({
      event_type: resolvedEventType,
      eventType: resolvedEventType,
      type: ledgerType,
      activityType,
      old_values,
      new_values,
      detailedDiffs,
      changed_fields,
    })
    if (normalized) {
      detailedDiffs = normalized.detailedDiffs
      resolvedOldValues = normalized.old_values
      resolvedNewValues = normalized.new_values
      resolvedChangedFields = normalized.changed_fields
    }
  }

  return {
    id: `audit_logs:${row.id}`,
    eventType,
    type: ledgerType,
    activityType,
    time: ts,
    timestamp: ts,
    createdAt: ts,
    userId,
    targetUserId: String(p.targetUserId || p.userId || userId || '').trim() || userId,
    eventData: {
      ...p,
      type: ledgerType,
      event_type: resolvedEventType,
      eventType: resolvedEventType,
      activityType,
      displayType,
      userId,
      userName: colPerformedByName || p.userName || p.performed_by_name || p.targetName || null,
      userEmail: p.userEmail || p.targetEmail || null,
      targetName: colTargetLabel || p.target_label || p.targetName || p.userName || null,
      targetEmail: p.targetEmail || p.userEmail || null,
      module: colModule || p.module || null,
      action: colAction || p.action || null,
      performed_by: colPerformedBy || p.performed_by || userId || null,
      performed_by_name: colPerformedByName || p.performed_by_name || p.userName || null,
      target_id: colTargetId || p.target_id || null,
      target_label: colTargetLabel || p.target_label || null,
      old_values: resolvedOldValues,
      new_values: resolvedNewValues,
      updatedFields: resolvedChangedFields,
      changed_fields: resolvedChangedFields,
      user_agent: colUserAgent || p.user_agent || null,
      summary: p.summary || null,
      target_user: p.target_user || null,
      detailedDiffs,
    },
    details: p,
    targetName: colTargetLabel || p.target_label || p.targetName || p.userName || null,
    targetEmail: p.targetEmail || p.userEmail || null,
  }
}

function buildDetailedDiffs(oldValues, newValues, fields) {
  if (!fields?.length) return {}
  const diffs = {}
  for (const field of fields) {
    const oldVal = oldValues?.[field]
    const newVal = newValues?.[field]
    diffs[field] = {
      old: oldVal,
      new: newVal,
      before: oldVal,
      after: newVal,
    }
  }
  return diffs
}

/**
 * Read institute audit ledger (failsafe when Dash / Infra API returns 500).
 *
 * @param {{
 *   limit?: number,
 *   offset?: number,
 *   eventType?: string,
 *   userId?: string,
 *   dateFrom?: string,
 *   dateTo?: string,
 *   search?: string,
 *   module?: string,
 *   action?: string,
 *   performedByName?: string,
 *   targetLabel?: string,
 * }} filters
 */
export async function queryLocalAuditLogsPage(filters = {}) {
  if (!isPgConfigured()) {
    return { events: [], total: 0, limit: filters.limit ?? 50, offset: filters.offset ?? 0, source: 'ledger' }
  }
  const pool = getPgPool()
  if (!pool) {
    return { events: [], total: 0, limit: filters.limit ?? 50, offset: filters.offset ?? 0, source: 'ledger' }
  }

  await ensureAuditLogsSchema(pool)

  const limit = Math.max(1, Math.min(500, Number(filters.limit || 50)))
  const offset = Math.max(0, Number(filters.offset || 0))
  const where = ['1=1']
  const params = []
  let p = 1

  const eventType = String(filters.eventType || '').trim()
  if (eventType) {
    const types = expandAuthEventTypes(eventType)
    if (types.length === 1) {
      where.push(`type = $${p++}`)
      params.push(types[0])
    } else if (types.length > 1) {
      where.push(`type = ANY($${p++}::text[])`)
      params.push(types)
    }
  }

  const userId = String(filters.userId || '').trim()
  if (userId) {
    where.push(
      `(performed_by = $${p} OR payload->>'userId' = $${p} OR payload->>'targetUserId' = $${p} OR payload->>'triggeredBy' = $${p} OR payload->>'performed_by' = $${p})`,
    )
    params.push(userId)
    p++
  }

  const moduleFilter = String(filters.module || '').trim()
  if (moduleFilter) {
    where.push(`(module = $${p} OR payload->>'module' = $${p})`)
    params.push(moduleFilter)
    p++
  }

  const actionFilter = String(filters.action || '').trim()
  if (actionFilter) {
    where.push(`(action = $${p} OR payload->>'action' = $${p})`)
    params.push(actionFilter)
    p++
  }

  const performedByName = sanitizeIlikeTerm(filters.performedByName)
  if (performedByName) {
    where.push(
      `(performed_by_name ILIKE $${p} OR payload->>'performed_by_name' ILIKE $${p} OR payload->>'userName' ILIKE $${p})`,
    )
    params.push(`%${performedByName}%`)
    p++
  }

  const searchTerm = sanitizeIlikeTerm(filters.search)
  if (searchTerm) {
    where.push(
      `(payload::text ILIKE $${p} OR target_label ILIKE $${p} OR performed_by_name ILIKE $${p} OR module ILIKE $${p})`,
    )
    params.push(`%${searchTerm}%`)
    p++
  }

  const targetLabelOnly = sanitizeIlikeTerm(filters.targetLabel)
  if (targetLabelOnly && !searchTerm) {
    where.push(`(target_label ILIKE $${p} OR payload->>'target_label' ILIKE $${p})`)
    params.push(`%${targetLabelOnly}%`)
    p++
  }

  if (filters.dateFrom) {
    where.push(`created_at >= $${p++}::timestamptz`)
    params.push(String(filters.dateFrom))
  }
  if (filters.dateTo) {
    where.push(`created_at <= $${p++}::timestamptz`)
    params.push(String(filters.dateTo))
  }

  const whereSql = where.join(' AND ')

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM public.audit_logs WHERE ${whereSql}`,
    params,
  )
  const { rows } = await pool.query(
    `
      SELECT
        id, type, payload, created_at,
        event_type, module, action, performed_by, performed_by_name,
        target_id, target_label, old_values, new_values, changed_fields, user_agent
      FROM public.audit_logs
      WHERE ${whereSql}
      ORDER BY created_at DESC
      LIMIT $${p} OFFSET $${p + 1}
    `,
    [...params, limit, offset],
  )

  const events = (rows || []).map(mapLedgerRowToAuthEvent)
  return {
    events,
    total: Number(countRows[0]?.cnt ?? events.length),
    limit,
    offset,
    source: 'ledger',
  }
}

/**
 * True if the same target already has a user_account_changed row within the window.
 * Used to prevent duplicate rows from dual writes or auth + API both logging one save.
 *
 * @param {string} targetUserId
 * @param {number} [withinSeconds]
 */
export async function hasRecentUserAccountChangedLog(targetUserId, withinSeconds = 2) {
  const sid = String(targetUserId || '').trim()
  if (!sid || !isPgConfigured()) return false
  const pool = getPgPool()
  if (!pool) return false

  const since = new Date(Date.now() - Math.max(1, withinSeconds) * 1000).toISOString()

  try {
    const { rows: lmsRows } = await pool.query(
      `
        SELECT id FROM lms_activity_logs
        WHERE "activityType" = 'USER_ACCOUNT_CHANGED'
          AND (
            "userId" = $1
            OR NULLIF(TRIM(details->>'targetUserId'), '') = $1
            OR NULLIF(TRIM(details->'payload'->>'targetUserId'), '') = $1
          )
          AND "timestamp" >= $2
        LIMIT 1
      `,
      [sid, since],
    )
    if (lmsRows?.length) return true

    await ensureAuditLogsSchema(pool)
    const { rows: ledgerRows } = await pool.query(
      `
        SELECT id FROM public.audit_logs
        WHERE type = $1
          AND (
            NULLIF(TRIM(payload->>'targetUserId'), '') = $2
            OR NULLIF(TRIM(payload->>'userId'), '') = $2
          )
          AND created_at >= NOW() - ($3::int * INTERVAL '1 second')
        LIMIT 1
      `,
      [USER_ACCOUNT_CHANGED_TYPE, sid, Math.max(1, withinSeconds)],
    )
    return (ledgerRows?.length ?? 0) > 0
  } catch {
    return false
  }
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 */
/**
 * @param {{ clearType: string, beforeDate?: string, fromDate?: string, toDate?: string }} input
 */
export function parseAuditClearParams(input = {}) {
  const clearType = String(input.clearType || '').trim()
  if (!['before_date', 'date_range', 'all'].includes(clearType)) {
    const err = new Error('clearType must be before_date, date_range, or all.')
    err.status = 400
    throw err
  }
  const beforeDate = toAuditIsoDate(input.beforeDate, false)
  const fromDate = toAuditIsoDate(input.fromDate, false)
  const toDate = toAuditIsoDate(input.toDate, true)

  if (clearType === 'before_date' && !beforeDate) {
    const err = new Error('beforeDate is required for before_date clear.')
    err.status = 400
    throw err
  }
  if (clearType === 'date_range') {
    if (!fromDate || !toDate) {
      const err = new Error('fromDate and toDate are required for date_range clear.')
      err.status = 400
      throw err
    }
    if (new Date(fromDate).getTime() > new Date(toDate).getTime()) {
      const err = new Error('fromDate must be on or before toDate.')
      err.status = 400
      throw err
    }
  }

  return { clearType, beforeDate, fromDate, toDate }
}

function buildAuditClearWhere(params) {
  const { clearType, beforeDate, fromDate, toDate } = params
  if (clearType === 'all') {
    return { clause: '', values: [] }
  }
  if (clearType === 'before_date') {
    return { clause: 'WHERE created_at < $1::date', values: [beforeDate.slice(0, 10)] }
  }
  return {
    clause: 'WHERE created_at >= $1::timestamptz AND created_at < ($2::date + interval \'1 day\')',
    values: [fromDate, toDate.slice(0, 10)],
  }
}

/** LMS activity logs store ISO timestamps in a VARCHAR column. */
function buildLmsActivityClearWhere(params) {
  const { clearType, beforeDate, fromDate, toDate } = params
  if (clearType === 'all') {
    return { clause: '', values: [] }
  }
  if (clearType === 'before_date') {
    return {
      clause: `WHERE "timestamp"::timestamptz < $1::date`,
      values: [beforeDate.slice(0, 10)],
    }
  }
  return {
    clause: `WHERE "timestamp"::timestamptz >= $1::timestamptz AND "timestamp"::timestamptz < ($2::date + interval '1 day')`,
    values: [fromDate, toDate.slice(0, 10)],
  }
}

async function countAuditLogsTableForClear(pool, params) {
  await ensureAuditLogsSchema(pool)
  const { clause, values } = buildAuditClearWhere(params)
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM public.audit_logs ${clause}`,
    values,
  )
  return Number(rows[0]?.cnt ?? 0)
}

async function countLmsActivityLogsTableForClear(pool, params) {
  const { clause, values } = buildLmsActivityClearWhere(params)
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM lms_activity_logs ${clause}`,
    values,
  )
  return Number(rows[0]?.cnt ?? 0)
}

/** @returns {{ count: number, auditLogs: number, lmsActivityLogs: number }} */
export async function countAuditLogsForClear(params) {
  if (!isPgConfigured()) return { count: 0, auditLogs: 0, lmsActivityLogs: 0 }
  const pool = getPgPool()
  if (!pool) return { count: 0, auditLogs: 0, lmsActivityLogs: 0 }
  const auditLogs = await countAuditLogsTableForClear(pool, params)
  const lmsActivityLogs = await countLmsActivityLogsTableForClear(pool, params)
  return { count: auditLogs + lmsActivityLogs, auditLogs, lmsActivityLogs }
}

/** @returns {{ deleted: number, auditLogs: number, lmsActivityLogs: number }} */
export async function deleteAuditLogsForClear(params) {
  if (!isPgConfigured()) {
    const err = new Error('PostgreSQL is not configured.')
    err.status = 503
    throw err
  }
  const pool = getPgPool()
  if (!pool) {
    const err = new Error('PostgreSQL pool unavailable.')
    err.status = 503
    throw err
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await ensureAuditLogsSchema(client)

    const auditClause = buildAuditClearWhere(params)
    const lmsClause = buildLmsActivityClearWhere(params)

    const auditResult = await client.query(
      `DELETE FROM public.audit_logs ${auditClause.clause}`,
      auditClause.values,
    )
    const lmsResult = await client.query(
      `DELETE FROM lms_activity_logs ${lmsClause.clause}`,
      lmsClause.values,
    )

    const auditLogs = Number(auditResult?.rowCount ?? 0)
    const lmsActivityLogs = Number(lmsResult?.rowCount ?? 0)
    await client.query('COMMIT')
    return { deleted: auditLogs + lmsActivityLogs, auditLogs, lmsActivityLogs }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

/**
 * @param {string} type
 * @param {Record<string, unknown>} payload
 * @param {{
 *   event_type?: string,
 *   module?: string,
 *   action?: string,
 *   performed_by?: string,
 *   performed_by_name?: string,
 *   target_id?: string|null,
 *   target_label?: string|null,
 *   old_values?: object|null,
 *   new_values?: object|null,
 *   changed_fields?: string[],
 *   user_agent?: string|null,
 * }} [columns]
 */
export async function insertAuditLogRecord(type, payload, columns = {}) {
  if (!isPgConfigured()) return { ok: true, skipped: true }
  const pool = getPgPool()
  if (!pool) return { ok: true, skipped: true }
  const eventType = String(type || '').trim()
  if (!eventType) throw new Error('audit log type is required')
  await ensureAuditLogsSchema(pool)
  const mergedPayload = { ...(payload ?? {}), ...(columns?.event_type ? { event_type: columns.event_type } : {}) }
  const { rows } = await pool.query(
    `
      INSERT INTO public.audit_logs (
        type, payload, created_at,
        event_type, module, action, performed_by, performed_by_name,
        target_id, target_label, old_values, new_values, changed_fields, user_agent
      )
      VALUES (
        $1, $2::jsonb, NOW(),
        $3, $4, $5, $6, $7,
        $8, $9, $10::jsonb, $11::jsonb, $12, $13
      )
      RETURNING id, created_at
    `,
    [
      eventType,
      JSON.stringify(mergedPayload),
      columns.event_type || payload?.event_type || eventType.toLowerCase() || null,
      columns.module || payload?.module || null,
      columns.action || payload?.action || null,
      columns.performed_by || payload?.performed_by || payload?.userId || null,
      columns.performed_by_name || payload?.performed_by_name || payload?.userName || null,
      columns.target_id || payload?.target_id || null,
      columns.target_label || payload?.target_label || null,
      columns.old_values || payload?.old_values ? JSON.stringify(columns.old_values || payload.old_values) : null,
      columns.new_values || payload?.new_values ? JSON.stringify(columns.new_values || payload.new_values) : null,
      columns.changed_fields || payload?.changed_fields || null,
      columns.user_agent || payload?.user_agent || null,
    ],
  )
  return { ok: true, id: rows?.[0]?.id, createdAt: rows?.[0]?.created_at }
}
