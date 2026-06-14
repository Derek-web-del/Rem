import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function patchSubjectsRouter() {
  const filePath = path.join(ROOT, 'server/api/state/subjectsRouter.js')
  let s = fs.readFileSync(filePath, 'utf8')

  if (!s.includes('subjectAudit.js')) {
    s = s.replace(
      "import { extendUpdateSetWithIntegrity, stampRowLastModified } from '../../lib/recordIntegrity.js'",
      `import { extendUpdateSetWithIntegrity, stampRowLastModified } from '../../lib/recordIntegrity.js'
import {
  subjectPgRowSnapshot,
  computeSubjectDetailedDiffs,
  subjectAuditDescription,
  subjectAuditDetails,
} from '../../lib/subjectAudit.js'

const SUBJECT_SELECT_WITH_FACULTY = \`
  SELECT
    s.id,
    s.subject_code,
    s.subject_name,
    s.grade_level,
    s.semester,
    s.faculty_id,
    s.syllabus_pdf,
    s.subject_photo,
    s.created_at,
    COALESCE(
      NULLIF(trim(concat_ws(' ',
        nullif(trim(f.first_name), ''),
        nullif(trim(f.middle_name), ''),
        nullif(trim(f.last_name), '')
      )), ''),
      NULLIF(trim(f.name), '')
    ) AS faculty_name
  FROM subjects s
  LEFT JOIN faculties f ON f.id::text = s.faculty_id::text
\``,
    )
  }

  s = s.replace(
    `      const row = rows?.[0]
      await auditInstituteRecord(adminSession, 'SUBJECT_CREATED', {
        recordType: 'subject',
        recordId: String(row?.id ?? ''),
        description: \`Subject created: \${subject_name}\`,
      })`,
    `      const row = rows?.[0]
      const createdSnap = subjectPgRowSnapshot(row, row?.faculty_name)
      await auditInstituteRecord(adminSession, 'SUBJECT_CREATED', {
        recordType: 'subject',
        recordId: String(row?.id ?? ''),
        description: subjectAuditDescription('created', createdSnap),
        details: subjectAuditDetails(createdSnap),
      })`,
  )

  if (!s.includes('existingRows')) {
    s = s.replace(
      `      const facultyIdParam = faculty_id || null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const { rows } = await pool.query(
        \`
          UPDATE subjects
          SET subject_code = $1, subject_name = $2, grade_level = $3, semester = $4,
            faculty_id = $5, syllabus_pdf = $6, subject_photo = $7
          WHERE id = $8
          RETURNING id, subject_code, subject_name, grade_level, semester,
            faculty_id, syllabus_pdf, subject_photo, created_at
        \`,
        [subject_code, subject_name, grade_level, semester, facultyIdParam, syllabus_pdf, subject_photo, id],
      )`,
      `      const { rows: existingRows } = await pool.query(
        \`\${SUBJECT_SELECT_WITH_FACULTY} WHERE s.id = $1 LIMIT 1\`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }

      const facultyIdParam = faculty_id || null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const { rows } = await pool.query(
        \`
          UPDATE subjects
          SET subject_code = $1, subject_name = $2, grade_level = $3, semester = $4,
            faculty_id = $5, syllabus_pdf = $6, subject_photo = $7
          WHERE id = $8
          RETURNING id, subject_code, subject_name, grade_level, semester,
            faculty_id, syllabus_pdf, subject_photo, created_at,
            (SELECT COALESCE(
              NULLIF(trim(concat_ws(' ',
                nullif(trim(f.first_name), ''),
                nullif(trim(f.middle_name), ''),
                nullif(trim(f.last_name), '')
              )), ''),
              NULLIF(trim(f.name), '')
            ) FROM faculties f WHERE f.id::text = subjects.faculty_id::text LIMIT 1) AS faculty_name
        \`,
        [subject_code, subject_name, grade_level, semester, facultyIdParam, syllabus_pdf, subject_photo, id],
      )`,
    )
  }

  s = s.replace(
    `      if (!rows?.length) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      await auditInstituteRecord(adminSession, 'SUBJECT_UPDATED', {
        recordType: 'subject',
        recordId: String(id),
        description: \`Subject updated: \${subject_name}\`,
      })
      res.json({ ok: true, subject: subjectRowToResponse(rows[0]) })`,
    `      if (!rows?.length) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      const updatedRow = rows[0]
      const detailedDiffs = computeSubjectDetailedDiffs(existing, updatedRow, {
        oldFacultyName: existing.faculty_name,
        newFacultyName: updatedRow.faculty_name,
      })
      const updatedFields = Object.keys(detailedDiffs)
      if (updatedFields.length) {
        const newSnap = subjectPgRowSnapshot(updatedRow, updatedRow.faculty_name)
        await auditInstituteRecord(adminSession, 'SUBJECT_UPDATED', {
          recordType: 'subject',
          recordId: String(id),
          description: subjectAuditDescription('updated', newSnap),
          details: {
            ...subjectAuditDetails(newSnap),
            detailedDiffs,
            updatedFields,
            changed_fields: updatedFields,
          },
        })
      }
      res.json({ ok: true, subject: subjectRowToResponse(updatedRow) })`,
  )

  s = s.replace(
    `      console.log(\`Deleting ID \${id} from subjects in PostgreSQL\`)
      const r = await pool.query('DELETE FROM subjects WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      await auditInstituteRecord(adminSession, 'SUBJECT_DELETED', {
        recordType: 'subject',
        recordId: String(id),
        description: \`Subject deleted: \${id}\`,
      })`,
    `      const { rows: existingRows } = await pool.query(
        \`\${SUBJECT_SELECT_WITH_FACULTY} WHERE s.id = $1 LIMIT 1\`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      console.log(\`Deleting ID \${id} from subjects in PostgreSQL\`)
      const r = await pool.query('DELETE FROM subjects WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      const deletedSnap = subjectPgRowSnapshot(existing, existing.faculty_name)
      await auditInstituteRecord(adminSession, 'SUBJECT_DELETED', {
        recordType: 'subject',
        recordId: String(id),
        description: subjectAuditDescription('deleted', deletedSnap),
        details: {
          ...subjectAuditDetails(deletedSnap),
          deletedSnapshot: deletedSnap,
        },
      })`,
  )

  fs.writeFileSync(filePath, s)
  console.log('patched subjectsRouter.js')
}

function patchAnnouncementsRouter() {
  const filePath = path.join(ROOT, 'server/api/state/announcementsRouter.js')
  let s = fs.readFileSync(filePath, 'utf8')

  if (!s.includes('announcementAudit.js')) {
    s = s.replace(
      "import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'",
      `import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'
import {
  announcementPgRowSnapshot,
  computeAnnouncementDetailedDiffs,
  announcementAuditDescription,
  announcementAuditDetails,
} from '../../lib/announcementAudit.js'`,
    )
  }

  s = s.replace(
    `      const row = rows?.[0]
      await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_CREATED', {
        recordType: 'announcement',
        recordId: String(row?.id ?? ''),
        description: \`Announcement created: \${title}\`,
      })`,
    `      const row = rows?.[0]
      const createdSnap = announcementPgRowSnapshot(row)
      await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_CREATED', {
        recordType: 'announcement',
        recordId: String(row?.id ?? ''),
        description: announcementAuditDescription('created', createdSnap),
        details: announcementAuditDetails(createdSnap),
      })`,
  )

  if (!s.includes('ANNOUNCEMENT_UPDATED')) {
    s = s.replace(
      `      if (!rows?.length) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      res.json({ ok: true, announcement: announcementRowToResponse(rows[0]) })`,
      `      if (!rows?.length) {
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
      res.json({ ok: true, announcement: announcementRowToResponse(updatedRow) })`,
    )
  }

  s = s.replace(
    `  router.delete('/v1/announcements/:id', async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid announcement id.' })
        return
      }
      console.log(\`Deleting ID \${id} from announcements in PostgreSQL\`)
      const r = await pool.query('DELETE FROM announcements WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      res.json({ ok: true, id })
    } catch (e) {
      announcementPgError(res, e)
    }
  })`,
    `  router.delete('/v1/announcements/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid announcement id.' })
        return
      }
      const { rows: existingRows } = await pool.query(
        \`
          SELECT id, announcement_image, image_path, image_name, uploaded_by,
                 title, type, message, created_at, updated_at
          FROM announcements WHERE id = $1 LIMIT 1
        \`,
        [id],
      )
      const existing = existingRows?.[0]
      if (!existing) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      console.log(\`Deleting ID \${id} from announcements in PostgreSQL\`)
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
  })`,
  )

  fs.writeFileSync(filePath, s)
  console.log('patched announcementsRouter.js')
}

patchSubjectsRouter()
patchAnnouncementsRouter()
