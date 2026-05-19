import { expandAuthEventTypes } from '../api/logs.js'
import { USER_ACCOUNT_CHANGED_DISPLAY, USER_ACCOUNT_CHANGED_EVENT_TYPE } from './profileAudit.js'
import { getPgPool, isPgConfigured } from '../pgPool.js'

const USER_ACCOUNT_CHANGED_TYPE = USER_ACCOUNT_CHANGED_EVENT_TYPE

let schemaReady = false

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
  const userId = String(p.userId || p.targetUserId || '').trim()
  const ts = row.created_at
  return {
    id: `audit_logs:${row.id}`,
    eventType: String(row.type || USER_ACCOUNT_CHANGED_EVENT_TYPE),
    type: String(row.type || ''),
    time: ts,
    timestamp: ts,
    createdAt: ts,
    userId,
    targetUserId: String(p.targetUserId || p.userId || '').trim() || userId,
    eventData: {
      ...p,
      type: row.type,
      displayType: p.displayType || USER_ACCOUNT_CHANGED_DISPLAY,
      userId,
      userName: p.userName || p.targetName || null,
      userEmail: p.userEmail || p.targetEmail || null,
      targetName: p.targetName || p.userName || null,
      targetEmail: p.targetEmail || p.userEmail || null,
      updatedFields: p.updatedFields || p.changed_fields || [],
      changed_fields: p.changed_fields || p.updatedFields || [],
      performed_by: p.performed_by || null,
      target_user: p.target_user || null,
      detailedDiffs: p.detailedDiffs || {},
    },
    details: p,
    targetName: p.targetName || p.userName || null,
    targetEmail: p.targetEmail || p.userEmail || null,
  }
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
      `(payload->>'userId' = $${p} OR payload->>'targetUserId' = $${p} OR payload->>'triggeredBy' = $${p})`,
    )
    params.push(userId)
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

  const searchTerm = sanitizeIlikeTerm(filters.search)
  if (searchTerm) {
    where.push(`payload::text ILIKE $${p++}`)
    params.push(`%${searchTerm}%`)
  }

  const whereSql = where.join(' AND ')

  const { rows: countRows } = await pool.query(
    `SELECT COUNT(*)::int AS cnt FROM public.audit_logs WHERE ${whereSql}`,
    params,
  )
  const { rows } = await pool.query(
    `
      SELECT id, type, payload, created_at
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
export async function insertAuditLogRecord(type, payload) {
  if (!isPgConfigured()) return { ok: true, skipped: true }
  const pool = getPgPool()
  if (!pool) return { ok: true, skipped: true }
  const eventType = String(type || '').trim()
  if (!eventType) throw new Error('audit log type is required')
  await ensureAuditLogsSchema(pool)
  const { rows } = await pool.query(
    `
      INSERT INTO public.audit_logs (type, payload, created_at)
      VALUES ($1, $2::jsonb, NOW())
      RETURNING id, created_at
    `,
    [eventType, JSON.stringify(payload ?? {})],
  )
  return { ok: true, id: rows?.[0]?.id, createdAt: rows?.[0]?.created_at }
}
