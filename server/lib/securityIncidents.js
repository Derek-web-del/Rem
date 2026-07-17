/**
 * Incident Response: turns passive detection (lockout, quiz violations,
 * backup restore) into tracked case records. Additive to audit_logs —
 * does not replace it.
 */

let schemaMemo = null

export async function ensureSecurityIncidentsSchema(pool) {
  if (schemaMemo) return schemaMemo
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.security_incidents (
        id BIGSERIAL PRIMARY KEY,
        incident_type VARCHAR(64) NOT NULL,
        severity VARCHAR(16) NOT NULL DEFAULT 'medium',
        status VARCHAR(16) NOT NULL DEFAULT 'open',
        source_event_id VARCHAR(128),
        affected_user_id VARCHAR(128),
        affected_user_label VARCHAR(255),
        detected_by VARCHAR(32) NOT NULL DEFAULT 'system',
        assigned_to VARCHAR(128),
        summary TEXT NOT NULL,
        details JSONB NOT NULL DEFAULT '{}'::jsonb,
        resolution_notes TEXT,
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_incidents_status ON public.security_incidents (status)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_incidents_severity ON public.security_incidents (severity)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_incidents_type ON public.security_incidents (incident_type)`)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_security_incidents_created_at ON public.security_incidents (created_at DESC)`)
    schemaMemo = true
    return true
  } catch (e) {
    console.warn('[security-incidents] schema ensure failed:', e?.message || e)
    schemaMemo = false
    return false
  }
}

const VALID_SEVERITIES = new Set(['low', 'medium', 'high', 'critical'])
const VALID_STATUSES = new Set(['open', 'investigating', 'resolved', 'closed'])

function normalizeSeverity(severity) {
  const s = String(severity || '').trim().toLowerCase()
  return VALID_SEVERITIES.has(s) ? s : 'medium'
}

function normalizeStatus(status) {
  const s = String(status || '').trim().toLowerCase()
  return VALID_STATUSES.has(s) ? s : 'open'
}

function mapIncidentRow(row) {
  if (!row) return null
  return {
    id: String(row.id),
    incident_type: row.incident_type,
    severity: row.severity,
    status: row.status,
    source_event_id: row.source_event_id || null,
    affected_user_id: row.affected_user_id || null,
    affected_user_label: row.affected_user_label || null,
    detected_by: row.detected_by || 'system',
    assigned_to: row.assigned_to || null,
    summary: row.summary,
    details: row.details || {},
    resolution_notes: row.resolution_notes || null,
    resolved_at: row.resolved_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

/**
 * Raise a tracked incident. Called from detection points (lockout, quiz
 * violation threshold, backup restore) — never throws, so it can never
 * break the caller's primary flow.
 */
export async function createSecurityIncident(
  pool,
  {
    incidentType,
    severity = 'medium',
    summary,
    affectedUserId = null,
    affectedUserLabel = null,
    sourceEventId = null,
    detectedBy = 'system',
    details = {},
  } = {},
) {
  try {
    await ensureSecurityIncidentsSchema(pool)
    const type = String(incidentType || '').trim().toUpperCase()
    if (!type) return null
    const { rows } = await pool.query(
      `
      INSERT INTO public.security_incidents (
        incident_type, severity, status, source_event_id, affected_user_id,
        affected_user_label, detected_by, summary, details
      ) VALUES ($1, $2, 'open', $3, $4, $5, $6, $7, $8::jsonb)
      RETURNING *
      `,
      [
        type,
        normalizeSeverity(severity),
        sourceEventId ? String(sourceEventId) : null,
        affectedUserId ? String(affectedUserId) : null,
        affectedUserLabel ? String(affectedUserLabel) : null,
        String(detectedBy || 'system'),
        String(summary || type.replace(/_/g, ' ')),
        JSON.stringify(details || {}),
      ],
    )
    return mapIncidentRow(rows?.[0])
  } catch (e) {
    console.warn('[security-incidents] createSecurityIncident failed:', e?.message || e)
    return null
  }
}

/** Returns [] (never throws) on schema/query errors so a listing failure never crashes a page. */
export async function listSecurityIncidents(pool, filters = {}) {
  try {
    await ensureSecurityIncidentsSchema(pool)
    const params = []
    let sql = `SELECT * FROM public.security_incidents WHERE 1=1`

    const status = String(filters.status || '').trim().toLowerCase()
    if (status && VALID_STATUSES.has(status)) {
      params.push(status)
      sql += ` AND status = $${params.length}`
    }

    const severity = String(filters.severity || '').trim().toLowerCase()
    if (severity && VALID_SEVERITIES.has(severity)) {
      params.push(severity)
      sql += ` AND severity = $${params.length}`
    }

    const incidentType = String(filters.incident_type || filters.incidentType || '').trim().toUpperCase()
    if (incidentType) {
      params.push(incidentType)
      sql += ` AND incident_type = $${params.length}`
    }

    const limitNum = Number(filters.limit)
    const limit = Math.max(1, Math.min(200, Number.isFinite(limitNum) && limitNum > 0 ? limitNum : 100))
    sql += ` ORDER BY created_at DESC LIMIT ${limit}`

    const { rows } = await pool.query(sql, params)
    return (rows || []).map(mapIncidentRow).filter(Boolean)
  } catch (e) {
    console.warn('[security-incidents] listSecurityIncidents failed:', e?.message || e)
    return []
  }
}

/** Returns null (never throws) for missing rows or malformed ids — safe to call with untrusted input. */
export async function fetchSecurityIncidentById(pool, id) {
  const idStr = String(id ?? '').trim()
  if (!/^\d+$/.test(idStr)) return null
  try {
    await ensureSecurityIncidentsSchema(pool)
    const { rows } = await pool.query(`SELECT * FROM public.security_incidents WHERE id = $1 LIMIT 1`, [idStr])
    return mapIncidentRow(rows?.[0])
  } catch (e) {
    console.warn('[security-incidents] fetchSecurityIncidentById failed:', e?.message || e)
    return null
  }
}

/** Returns null (never throws) for missing rows, malformed ids, or query errors. */
export async function updateSecurityIncidentStatus(pool, id, { status, assignedTo, resolutionNotes } = {}) {
  try {
    const existing = await fetchSecurityIncidentById(pool, id)
    if (!existing) return null

    const nextStatus = status ? normalizeStatus(status) : existing.status
    const nextAssigned = assignedTo !== undefined ? (assignedTo ? String(assignedTo) : null) : existing.assigned_to
    const nextNotes =
      resolutionNotes !== undefined ? (resolutionNotes ? String(resolutionNotes) : null) : existing.resolution_notes
    const resolvedAt =
      nextStatus === 'resolved' || nextStatus === 'closed' ? new Date().toISOString() : existing.resolved_at

    const { rows } = await pool.query(
      `
      UPDATE public.security_incidents
      SET status = $2, assigned_to = $3, resolution_notes = $4, resolved_at = $5, updated_at = NOW()
      WHERE id = $1
      RETURNING *
      `,
      [existing.id, nextStatus, nextAssigned, nextNotes, resolvedAt],
    )
    return mapIncidentRow(rows?.[0])
  } catch (e) {
    console.warn('[security-incidents] updateSecurityIncidentStatus failed:', e?.message || e)
    return null
  }
}
