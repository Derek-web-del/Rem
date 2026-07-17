import { getPgPool, isPgConfigured } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { requireAdminSession, auditInstituteRecord } from './state/shared.js'
import {
  listSecurityIncidents,
  fetchSecurityIncidentById,
  updateSecurityIncidentStatus,
} from '../lib/securityIncidents.js'

const VALID_STATUS_VALUES = new Set(['open', 'investigating', 'resolved', 'closed'])

async function requireAdmin(req, res, auth) {
  const session = await requireAdminSession(req, res, auth)
  if (!session) return null
  const user = session.user ?? session?.data?.user ?? {}
  return { session, user, userId: String(user.id || '').trim() }
}

export function createSecurityIncidentsRouter(express, auth) {
  const router = express.Router()

  if (!isPgConfigured()) {
    router.get('/v1/admin/security-incidents', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    router.patch('/v1/admin/security-incidents/:id', (_req, res) => {
      res.status(503).json({ error: 'DATABASE_NOT_CONFIGURED', message: 'The system database is not available. Please try again later.' })
    })
    return router
  }

  router.get('/v1/admin/security-incidents', async (req, res) => {
    try {
      const ctx = await requireAdmin(req, res, auth)
      if (!ctx) return
      const pool = getPgPool()
      const incidents = await listSecurityIncidents(pool, {
        status: req.query?.status,
        severity: req.query?.severity,
        incident_type: req.query?.incident_type || req.query?.incidentType,
        limit: req.query?.limit,
      })
      res.json({ ok: true, incidents })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/admin/security-incidents')
    }
  })

  router.patch('/v1/admin/security-incidents/:id', async (req, res) => {
    try {
      const ctx = await requireAdmin(req, res, auth)
      if (!ctx) return
      const id = String(req.params.id || '').trim()
      if (!/^\d+$/.test(id)) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid incident id.' })
        return
      }
      const existing = await fetchSecurityIncidentById(getPgPool(), id)
      if (!existing) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Incident not found.' })
        return
      }

      const rawStatus = req.body?.status
      if (rawStatus != null && !VALID_STATUS_VALUES.has(String(rawStatus).trim().toLowerCase())) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: `Invalid status. Use one of: ${[...VALID_STATUS_VALUES].join(', ')}.`,
        })
        return
      }

      const pool = getPgPool()
      const updated = await updateSecurityIncidentStatus(pool, id, {
        status: rawStatus,
        assignedTo: req.body?.assignedTo ?? req.body?.assigned_to,
        resolutionNotes: req.body?.resolutionNotes ?? req.body?.resolution_notes,
      })

      if (!updated) {
        res.status(500).json({ error: 'UPDATE_FAILED', message: 'Could not update the incident. Please try again.' })
        return
      }

      await auditInstituteRecord(ctx.session, 'SECURITY_INCIDENT_UPDATED', {
        recordType: 'security_incident',
        recordId: id,
        description: `Incident ${existing.incident_type} updated to status "${updated?.status || existing.status}".`,
        details: {
          incident_id: id,
          incident_type: existing.incident_type,
          previous_status: existing.status,
          new_status: updated?.status,
          assigned_to: updated?.assigned_to,
        },
      })

      res.json({ ok: true, incident: updated })
    } catch (e) {
      sendSafeServerError(res, e, 'PATCH /api/v1/admin/security-incidents/:id')
    }
  })

  return router
}
