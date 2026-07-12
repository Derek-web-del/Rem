import { requireAdminSession, logStatePostgresError, auditInstituteRecord, announcementPgError, ANNOUNCEMENT_TYPES } from './shared.js'
import { requireAnyRoleSession } from '../../lib/security.js'
import { announcementRowToResponse, ensureAnnouncementsMetadataColumns, maybeDeleteOldAnnouncementFile, readAnnouncementBodyFields, resolveAnnouncementImageForSave, resolveSessionUploadedByLabel } from '../../lib/announcementsDb.js'
import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'
import {
  announcementPgRowSnapshot,
  computeAnnouncementDetailedDiffs,
  announcementAuditDescription,
  announcementAuditDetails,
} from '../../lib/announcementAudit.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerAnnouncementsRoutes(router, ctx) {
  const { pool, auth } = ctx
  router.get('/v1/announcements', async (req, res) => {
    try {
      if (!(await requireAnyRoleSession(req, res, auth, ['admin', 'faculty', 'student']))) return
      const rawLimit = Number(req.query?.limit)
      const hasLimit = Number.isFinite(rawLimit) && rawLimit > 0
      const limit = hasLimit ? Math.min(Math.max(1, Math.floor(rawLimit)), 20) : null
      const sql = `
        SELECT id, announcement_image, image_path, image_name, uploaded_by,
               title, type, message, created_at, updated_at
        FROM announcements
        WHERE archived_at IS NULL
        ORDER BY created_at DESC
        ${limit != null ? 'LIMIT $1' : ''}
      `
      const { rows } =
        limit != null ? await pool.query(sql, [limit]) : await pool.query(sql)
      res.json({ ok: true, announcements: rows.map((r) => announcementRowToResponse(r)) })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

  router.post('/v1/announcements', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const b = req.body || {}
      const { title, type, message, announcement_image, image_name } = readAnnouncementBodyFields(b)

      if (!title || !type || !message) {
        res.status(400).json({
          error: 'Required: title, type (or updateType), and message (or description).',
        })
        return
      }
      if (!ANNOUNCEMENT_TYPES.has(type)) {
        res.status(400).json({
          error: `type must be one of: ${[...ANNOUNCEMENT_TYPES].join(', ')}.`,
        })
        return
      }

      const imageFields = await resolveAnnouncementImageForSave({
        announcement_image,
        image_name,
        title,
      })
      const uploadedBy = resolveSessionUploadedByLabel(adminSession)

      const { rows } = await pool.query(
        `
          INSERT INTO announcements (
            announcement_image, image_path, image_name, title, type, message, uploaded_by, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
          RETURNING id, announcement_image, image_path, image_name, uploaded_by,
                    title, type, message, created_at, updated_at
        `,
        [
          imageFields.announcement_image || null,
          imageFields.image_path || null,
          imageFields.image_name || null,
          title,
          type,
          message,
          uploadedBy,
        ],
      )
      const row = rows?.[0]
      const createdSnap = announcementPgRowSnapshot(row)
      await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_CREATED', {
        recordType: 'announcement',
        recordId: String(row?.id ?? ''),
        description: announcementAuditDescription('created', createdSnap),
        details: announcementAuditDetails(createdSnap),
      })
      res.status(201).json({
        ok: true,
        announcement: announcementRowToResponse(row),
        id: row?.id != null ? Number(row.id) : null,
      })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

  router.put('/v1/announcements/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid announcement id.' })
        return
      }
      const b = req.body || {}
      const { title, type, message, announcement_image, image_name } = readAnnouncementBodyFields(b)

      if (!title || !type || !message) {
        res.status(400).json({
          error: 'Required: title, type (or updateType), and message (or description).',
        })
        return
      }
      if (!ANNOUNCEMENT_TYPES.has(type)) {
        res.status(400).json({
          error: `type must be one of: ${[...ANNOUNCEMENT_TYPES].join(', ')}.`,
        })
        return
      }

      const { rows: existingRows } = await pool.query(
        `
          SELECT id, announcement_image, image_path, image_name, uploaded_by,
                 title, type, message, created_at, updated_at
          FROM announcements WHERE id = $1 LIMIT 1
        `,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }

      const imageFields = await resolveAnnouncementImageForSave({
        announcement_image,
        image_name,
        title,
        existingPath: existing.image_path,
        existingDataUrl: existing.announcement_image,
      })
      await maybeDeleteOldAnnouncementFile(imageFields.deleteOldPath, imageFields.image_path)

      const uploadedBy =
        String(existing.uploaded_by ?? '').trim() || resolveSessionUploadedByLabel(adminSession)

      const { rows } = await pool.query(
        `
          UPDATE announcements
          SET title = $1, type = $2, message = $3,
              announcement_image = $4, image_path = $5, image_name = $6,
              uploaded_by = $7, updated_at = NOW()
          WHERE id = $8
          RETURNING id, announcement_image, image_path, image_name, uploaded_by,
                    title, type, message, created_at, updated_at
        `,
        [
          title,
          type,
          message,
          imageFields.announcement_image || null,
          imageFields.image_path || null,
          imageFields.image_name || null,
          uploadedBy,
          id,
        ],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      const updatedRow = rows[0]
      const detailedDiffs = computeAnnouncementDetailedDiffs(existing, updatedRow)
      const updatedFields = Object.keys(detailedDiffs)
      if (updatedFields.length) {
        const newSnap = announcementPgRowSnapshot(updatedRow)
        await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_UPDATED', {
          recordType: 'announcement',
          recordId: String(id),
          description: announcementAuditDescription('updated', newSnap),
          details: {
            ...announcementAuditDetails(newSnap),
            detailedDiffs,
            updatedFields,
            changed_fields: updatedFields,
          },
        })
      }
      res.json({ ok: true, announcement: announcementRowToResponse(updatedRow) })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

  router.delete('/v1/announcements/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid announcement id.' })
        return
      }
      const { rows: existingRows } = await pool.query(
        `
          SELECT id, announcement_image, image_path, image_name, uploaded_by,
                 title, type, message, created_at, updated_at
          FROM announcements WHERE id = $1 LIMIT 1
        `,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      console.log(`Deleting ID ${id} from announcements in PostgreSQL`)
      const r = await pool.query('DELETE FROM announcements WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      const deletedSnap = announcementPgRowSnapshot(existing)
      await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_DELETED', {
        recordType: 'announcement',
        recordId: String(id),
        description: announcementAuditDescription('deleted', deletedSnap),
        details: {
          ...announcementAuditDetails(deletedSnap),
          deletedSnapshot: deletedSnap,
        },
      })
      res.json({ ok: true, id })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

}
