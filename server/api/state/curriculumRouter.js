import {
  requireAdminSession,
  logStatePostgresError,
  auditInstituteRecord,
  purgeCurriculumFromAppStateJson,
} from './shared.js'
import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'
import {
  curriculumAuditDescription,
  curriculumAuditDetails,
  curriculumGuideRowSnapshot,
} from '../../lib/curriculumAudit.js'
import {
  computeSectionDetailedDiffs,
  sectionAuditDescription,
  sectionAuditDetails,
  sectionPgRowSnapshot,
} from '../../lib/sectionAudit.js'
import { removeFacultyAdvisoryLinksForSection } from '../../lib/sectionAdvisoryCleanup.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function registerCurriculumRoutes(router, ctx) {
  const { pool, auth } = ctx
  router.get('/v1/curriculum', async (_req, res) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, title, description, grade_level, file_name, source_id, created_at FROM curriculum ORDER BY id DESC',
      )
      res.json({ ok: true, curriculum: rows })
    } catch (e) {
      logStatePostgresError('GET /v1/curriculum', e)
      res.status(500).json({
        error: 'CURRICULUM_LIST_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/curriculum', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const title = String(req.body?.title ?? '').trim()
      const description = String(req.body?.description ?? '').trim()
      const grade_level = String(req.body?.grade_level ?? '').trim()
      if (!title || !description || !grade_level) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Expected JSON body with non-empty title, description, and grade_level.',
        })
        return
      }
      const file_name = req.body?.file_name != null ? String(req.body.file_name).trim() || null : null
      const source_id = req.body?.source_id != null ? String(req.body.source_id).trim() || null : null
      const { rows } = await pool.query(
        'INSERT INTO curriculum (title, description, grade_level, file_name, source_id) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, description, grade_level, file_name, source_id',
        [title, description, grade_level, file_name, source_id],
      )
      const row = rows[0]
      const insertId = Number(row?.id ?? 0)
      const snapshot = curriculumGuideRowSnapshot(row)
      if (snapshot) {
        await auditInstituteRecord(adminSession, 'CURRICULUM_CREATED', {
          recordType: 'curriculum',
          recordId: String(snapshot.id || insertId),
          description: curriculumAuditDescription('created', snapshot),
          details: curriculumAuditDetails(snapshot),
        })
      }
      res.status(201).json({ ok: true, id: insertId })
    } catch (e) {
      logStatePostgresError('POST /v1/curriculum', e)
      res.status(500).json({
        error: 'CURRICULUM_INSERT_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.put('/v1/curriculum/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid curriculum id.' })
        return
      }
      const { rows: beforeRows } = await pool.query(
        'SELECT id, title, description, grade_level, file_name, source_id FROM curriculum WHERE id = $1 LIMIT 1',
        [id],
      )
      if (!beforeRows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
        return
      }
      const beforeSnapshot = curriculumGuideRowSnapshot(beforeRows[0])
      const title = String(req.body?.title ?? '').trim()
      const description = String(req.body?.description ?? '').trim()
      const grade_level = String(req.body?.grade_level ?? '').trim()
      if (!title || !description || !grade_level) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Expected JSON body with non-empty title, description, and grade_level.',
        })
        return
      }
      const file_name = String(req.body?.file_name ?? '').trim() || null
      const source_id = String(req.body?.source_id ?? '').trim() || null
      const r = await pool.query(
        'UPDATE curriculum SET title = $1, description = $2, grade_level = $3, file_name = $4, source_id = $5 WHERE id = $6 RETURNING id, title, description, grade_level, file_name, source_id',
        [title, description, grade_level, file_name, source_id, id],
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
        return
      }
      const afterSnapshot = curriculumGuideRowSnapshot(r.rows?.[0])
      if (beforeSnapshot && afterSnapshot) {
        await auditInstituteRecord(adminSession, 'CURRICULUM_UPDATED', {
          recordType: 'curriculum',
          recordId: String(afterSnapshot.id || id),
          description: curriculumAuditDescription('updated', afterSnapshot),
          details: {
            ...curriculumAuditDetails(afterSnapshot),
            beforeSnapshot,
            afterSnapshot,
          },
        })
      }
      res.json({ ok: true, id })
    } catch (e) {
      logStatePostgresError('PUT /v1/curriculum/:id', e)
      res.status(500).json({
        error: 'CURRICULUM_UPDATE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.delete('/v1/curriculum/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const raw = String(req.params.id || '').trim()
      if (!raw) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing curriculum id.' })
        return
      }

      let purgeId = raw
      let snapshot = null
      let r

      if (/^\d+$/.test(raw)) {
        const id = Number(raw)
        const { rows: curRows } = await pool.query(
          'SELECT id, title, description, grade_level, file_name, source_id FROM curriculum WHERE id = $1 LIMIT 1',
          [id],
        )
        if (!curRows?.length) {
          res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
          return
        }
        const row = curRows[0]
        purgeId = String(row.source_id || raw).trim()
        snapshot = curriculumGuideRowSnapshot(row)
        if (!snapshot) {
          snapshot = curriculumGuideRowSnapshot({
            id: purgeId,
            title: row.title,
            grade_level: row.grade_level,
            description: row.description,
            file_name: row.file_name,
          })
        }
        r = await pool.query('DELETE FROM curriculum WHERE id = $1', [id])
      } else {
        try {
          const { rows: guideRows } = await pool.query(
            'SELECT id, grade, grade_level, subject, title, description, file_name FROM curriculum_guides WHERE id = $1 LIMIT 1',
            [raw],
          )
          if (guideRows?.length) snapshot = curriculumGuideRowSnapshot(guideRows[0])
        } catch {
          /* guides table may be absent */
        }
        if (!snapshot) {
          const { rows: curRows } = await pool.query(
            'SELECT title, description, grade_level, file_name, source_id FROM curriculum WHERE source_id = $1 LIMIT 1',
            [raw],
          )
          if (curRows?.length) snapshot = curriculumGuideRowSnapshot({ id: raw, ...curRows[0] })
        }
        r = await pool.query('DELETE FROM curriculum WHERE source_id = $1', [raw])
      }

      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
        return
      }

      try {
        await pool.query('DELETE FROM curriculum_guides WHERE id = $1', [String(purgeId).trim()])
      } catch {
        /* guides table may be absent on older schemas */
      }
      await purgeCurriculumFromAppStateJson(pool, purgeId)

      if (snapshot) {
        await auditInstituteRecord(adminSession, 'CURRICULUM_DELETED', {
          recordType: 'curriculum',
          recordId: String(snapshot.id || purgeId),
          description: curriculumAuditDescription('deleted', snapshot),
          details: {
            ...curriculumAuditDetails(snapshot),
            deletedSnapshot: snapshot,
          },
        })
      }

      res.json({ ok: true })
    } catch (e) {
      logStatePostgresError('DELETE /v1/curriculum/:id', e)
      res.status(500).json({
        error: 'CURRICULUM_DELETE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.get('/v1/sections', async (req, res) => {
    try {
      const grade = String(req.query.grade_level || req.query.grade || '').trim()
      let sql = 'SELECT id, section_name, grade_level, created_at FROM sections'
      const params = []
      if (grade) {
        params.push(grade)
        sql += ' WHERE grade_level = $1'
      }
      sql += ' ORDER BY id DESC'
      const { rows } = await pool.query(sql, params)
      res.json({ ok: true, sections: rows })
    } catch (e) {
      logStatePostgresError('GET /v1/sections', e)
      res.status(500).json({
        error: 'SECTIONS_LIST_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/sections', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const section_name = String(req.body?.section_name ?? '').trim()
      const grade_level = String(req.body?.grade_level ?? '').trim()
      if (!section_name || !grade_level) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Expected JSON body with non-empty section_name and grade_level.',
        })
        return
      }
      const { rows } = await pool.query(
        'INSERT INTO sections (section_name, grade_level) VALUES ($1, $2) RETURNING id, section_name, grade_level, created_at',
        [section_name, grade_level],
      )
      const row = rows?.[0]
      await auditInstituteRecord(adminSession, 'SECTION_CREATED', {
        recordType: 'section',
        recordId: String(row?.id ?? ''),
        description: `Section created: ${section_name} (${grade_level})`,
        details: {
          sectionName: section_name,
          gradeLevel: grade_level,
          recordId: String(row?.id ?? ''),
        },
      })
      res.status(201).json({
        ok: true,
        section: row,
        id: row?.id != null ? Number(row.id) : null,
      })
    } catch (e) {
      logStatePostgresError('POST /v1/sections', e)
      res.status(500).json({
        error: 'SECTIONS_INSERT_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.patch('/v1/sections/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid sections id.' })
        return
      }

      const { rows: found } = await pool.query(
        'SELECT id, section_name, grade_level FROM sections WHERE id = $1 LIMIT 1',
        [id],
      )
      if (!found?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
      }

      const beforeSnapshot = sectionPgRowSnapshot(found[0])
      const section_name =
        req.body?.section_name != null
          ? String(req.body.section_name).trim()
          : String(req.body?.name ?? '').trim()
      const grade_level =
        req.body?.grade_level != null
          ? String(req.body.grade_level).trim()
          : String(req.body?.grade ?? req.body?.gradeLevel ?? '').trim()

      if (!section_name && !grade_level) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Provide section_name and/or grade_level to update.',
        })
        return
      }

      const nextName = section_name || String(found[0].section_name ?? '').trim()
      const nextGrade = grade_level || String(found[0].grade_level ?? '').trim()
      if (!nextName || !nextGrade) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Section name and grade level cannot be empty.',
        })
        return
      }

      const { rows: updatedRows } = await pool.query(
        `UPDATE sections SET section_name = $1, grade_level = $2 WHERE id = $3
         RETURNING id, section_name, grade_level`,
        [nextName, nextGrade, id],
      )
      const afterSnapshot = sectionPgRowSnapshot(updatedRows?.[0])
      const detailedDiffs = computeSectionDetailedDiffs(beforeSnapshot, afterSnapshot)
      const updatedFields = Object.keys(detailedDiffs)

      if (afterSnapshot && updatedFields.length > 0) {
        await auditInstituteRecord(adminSession, 'SECTION_UPDATED', {
          recordType: 'section',
          recordId: String(id),
          description: sectionAuditDescription('updated', afterSnapshot),
          details: {
            ...sectionAuditDetails(afterSnapshot),
            detailedDiffs,
            updatedFields,
            changed_fields: updatedFields,
            beforeSnapshot,
            afterSnapshot,
          },
        })
      }

      res.json({ ok: true, id, section: updatedRows?.[0] ?? null })
    } catch (e) {
      logStatePostgresError('PATCH /v1/sections/:id', e)
      res.status(500).json({
        error: 'SECTIONS_UPDATE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.patch('/v1/sections/:id/archive', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid sections id.' })
        return
      }

      const { rows: found } = await pool.query(
        'SELECT id, section_name, grade_level FROM sections WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
        [id],
      )
      if (!found?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
      }

      const snapshot = sectionPgRowSnapshot(found[0])
      const r = await pool.query(
        `UPDATE sections SET status = 'archived' WHERE id = $1 AND deleted_at IS NULL`,
        [id],
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
      }

      await removeFacultyAdvisoryLinksForSection(pool, id, adminSession, 'archived')

      if (snapshot) {
        await auditInstituteRecord(adminSession, 'SECTION_ARCHIVED', {
          recordType: 'section',
          recordId: String(id),
          description: sectionAuditDescription('archived', snapshot),
          details: {
            ...sectionAuditDetails(snapshot),
            archivedSnapshot: snapshot,
          },
        })
      }

      res.json({ ok: true, id, status: 'archived' })
    } catch (e) {
      logStatePostgresError('PATCH /v1/sections/:id/archive', e)
      res.status(500).json({
        error: 'SECTIONS_ARCHIVE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.delete('/v1/sections/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid sections id.' })
        return
      }

      const { rows: found } = await pool.query(
        'SELECT id, section_name, grade_level FROM sections WHERE id = $1 LIMIT 1',
        [id],
      )
      if (!found?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
      }

      const snapshot = sectionPgRowSnapshot(found[0])
      await removeFacultyAdvisoryLinksForSection(pool, id, adminSession, 'deleted')

      const r = await pool.query('DELETE FROM sections WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
      }

      if (snapshot) {
        await auditInstituteRecord(adminSession, 'SECTION_DELETED', {
          recordType: 'section',
          recordId: String(id),
          description: sectionAuditDescription('deleted', snapshot),
          details: {
            ...sectionAuditDetails(snapshot),
            deletedSnapshot: snapshot,
          },
        })
      }

      res.json({ ok: true, id })
    } catch (e) {
      logStatePostgresError('DELETE /v1/sections/:id', e)
      res.status(500).json({
        error: 'SECTIONS_DELETE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

}
