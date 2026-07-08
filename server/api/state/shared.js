/**
 * Shared institute state API helpers (extracted from legacy state.js).
 * Auth: Better Auth session cookies via auth.api.getSession — see docs/AUTH.md.
 */
import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import { findAuthUserIdByEmail } from '../logs.js'
import { getPgPool, isPgConfigured } from '../../pgPool.js'
import {
  buildFacultyAuditTargetName,
  buildFacultyComparePayload,
  computeFacultyProfileDetailedDiffs,
  fetchFacultyPriorState,
} from '../../lib/facultyProfileAudit.js'
import {
  buildStudentAuditTargetName,
  computeStudentProfileDetailedDiffs,
} from '../../lib/studentProfileAudit.js'
import { customActivityLogger } from '../../services/CustomActivityLogger.js'
import {
  facultyPhotoUploadMiddleware,
  getFacultyUploadFile,
  normalizeFacultyMultipartBody,
} from '../../lib/facultyMultipart.js'
import { resolveFacultyPhotoForDb } from '../../lib/facultyPhotoStorage.js'
import { resolveSubjectImagePath } from '../../lib/subjectImageStorage.js'
import { ensureCurriculumGuidesPublishColumns } from '../../lib/curriculumGuidesDb.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import {
  ensureRecordIntegrityColumns,
  extendUpdateSetWithIntegrity,
  stampRowLastModified,
} from '../../lib/recordIntegrity.js'
import { logUnauthorizedAccessFromRequest, requireDestructiveConfirm } from '../../lib/security.js'
import { adminTermsAccepted, fetchAdminTermsRow } from '../../lib/adminTerms.js'
import { isTermsExemptRequest, sendTermsNotAccepted } from '../../lib/termsGate.js'
import { validateProfilePhotoPayload } from '../../../shared/uploadLimits.js'
import { decryptStudentPiiFields, studentDisplayName } from '../../lib/studentPiiCrypto.js'
import {
  announcementRowToResponse,
  ensureAnnouncementsMetadataColumns,
  maybeDeleteOldAnnouncementFile,
  readAnnouncementBodyFields,
  resolveAnnouncementImageForSave,
  resolveSessionUploadedByLabel,
} from '../../lib/announcementsDb.js'
import {
  ARCHIVE_ENTITY_TYPES,
  assertSqlIdentifier,
  filterFacultyRowKeys,
  resolveArchiveTableSql,
} from '../../lib/sqlGuards.js'

export const STATE_ID = 'default'
export const BCRYPT_ROUNDS = 12

export async function hashStudentPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

export async function hashFacultyPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

export function omitStudentPassword(row) {
  if (!row || typeof row !== 'object') return row
  const { password_hash: _p, ...rest } = row
  return rest
}

export async function auditInstituteRecord(adminSession, activityType, payload = {}) {
  const actor = adminSession?.user || adminSession?.data?.user || {}
  const actorId = String(actor.id || '').trim()
  if (!actorId) return
  try {
    await customActivityLogger.logInstituteRecordEvent(actorId, activityType, {
      actorName: String(actor.name || ''),
      actorEmail: String(actor.email || ''),
      actorRole: 'admin',
      ...payload,
    })
  } catch (e) {
    console.warn('[audit] institute record log failed:', e?.message || e)
  }
}

/** System-triggered audit events (scheduled jobs, auto-purge, etc.). */
export async function auditSystemEvent(activityType, payload = {}) {
  try {
    await customActivityLogger.logInstituteRecordEvent('system', activityType, {
      actorName: 'System',
      actorEmail: null,
      actorRole: 'system',
      ...payload,
    })
  } catch (e) {
    console.warn('[audit] system event log failed:', e?.message || e)
  }
}

export const ARCHIVE_RETENTION_DAYS = 365

export function computeArchiveRetention(archivedAt) {
  const archived = archivedAt instanceof Date ? archivedAt : new Date(archivedAt)
  if (Number.isNaN(archived.getTime())) {
    return {
      days_until_deletion: ARCHIVE_RETENTION_DAYS,
      auto_delete_at: null,
      warning_level: 'normal',
      purge_eligible: false,
    }
  }
  const elapsedMs = Date.now() - archived.getTime()
  const elapsedDays = Math.floor(elapsedMs / (1000 * 60 * 60 * 24))
  const days_until_deletion = Math.max(0, ARCHIVE_RETENTION_DAYS - elapsedDays)
  const auto_delete_at = new Date(archived.getTime() + ARCHIVE_RETENTION_DAYS * 24 * 60 * 60 * 1000)
  let warning_level = 'normal'
  if (days_until_deletion === 1) warning_level = 'red'
  else if (days_until_deletion > 0 && days_until_deletion <= 7) warning_level = 'amber'
  return {
    days_until_deletion,
    auto_delete_at: auto_delete_at.toISOString(),
    warning_level,
    purge_eligible: days_until_deletion <= 0,
  }
}

export function readStudentField(b, camel, snake) {
  const a = b?.[camel]
  const c = b?.[snake]
  const x = a != null && String(a).trim() !== '' ? a : c
  if (x == null) return ''
  return String(x).trim()
}

export function readStudentOptional(b, camel, snake) {
  const s = readStudentField(b, camel, snake)
  return s || null
}

export function parseStudentSectionId(b) {
  const v = b?.sectionId ?? b?.section_id
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export function parseStudentDob(b) {
  const s =
    readStudentField(b, 'dob', 'date_of_birth') ||
    readStudentField(b, 'dateOfBirth', 'date_of_birth')
  if (!s) return { ok: false, error: 'Date of birth is required (YYYY-MM-DD).' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Date of birth must be YYYY-MM-DD.' }
  return { ok: true, value: s }
}

/** Primary contact field in DB is `contact_no`; accept legacy / camel names in JSON. */
export function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

export function readStudentContact(b) {
  const a =
    readStudentField(b, 'phoneNumber', 'phone_number') ||
    readStudentField(b, 'contactNumber', 'contact_no') ||
    readStudentField(b, 'contactNo', 'contact_no')
  if (a) return a
  return readStudentField(b, 'contactNumber', 'contact_number')
}

export function readStudentParentContact(b) {
  return (
    readStudentField(b, 'parentPhone', 'parent_phone') ||
    readStudentField(b, 'parentContact', 'parent_contact')
  )
}

export function readStudentAppPassword(b) {
  return (
    readStudentField(b, 'appPasswordGmail', 'app_password_gmail') ||
    readStudentField(b, 'appPassword', 'app_password')
  )
}

/** Primary photo field in DB is `photo_url` (stored file path or legacy data URL); accept legacy keys. */
export function readStudentPhotoUrl(b) {
  const a =
    readStudentOptional(b, 'studentPhotoUrl', 'photo_url') ||
    readStudentOptional(b, 'photoDataUrl', 'photo_url')
  if (a) return a
  return readStudentOptional(b, 'studentPhotoUrl', 'student_photo_url')
}

export const SECRET_KEYS = [
  'password_hash',
  'password',
  'raw_password_placeholder',
  'app_password_gmail',
  'app_password',
  'appPassword',
  'appPasswordGmail',
]

export const FACULTY_SECRET_KEYS = [
  'password_hash',
  'password',
  'raw_password_placeholder',
  'app_password_gmail',
  'app_password',
  'appPassword',
  'appPasswordGmail',
]

export function omitFacultySecrets(row) {
  if (!row || typeof row !== 'object') return row
  const out = { ...row }
  for (const key of FACULTY_SECRET_KEYS) delete out[key]
  return out
}

export function sectionGradeLabel(s) {
  return String(s?.grade_level ?? s?.grade ?? '').trim()
}

export function collectFacultyGradeLevels(row, advisorySections) {
  const grades = new Set()
  const rowGrade = String(row?.grade_level ?? row?.grade ?? '').trim()
  if (rowGrade) grades.add(rowGrade)
  for (const s of advisorySections || []) {
    const g = sectionGradeLabel(s)
    if (g) grades.add(g)
  }
  return [...grades]
}

/** Cached column list for `public.faculties` (pgAdmin / mirror table). */
export let facultiesColumnSetCache = null

export function resetFacultiesColumnSetCache() {
  facultiesColumnSetCache = null
}

export async function getFacultiesColumnSet(pool) {
  if (facultiesColumnSetCache) return facultiesColumnSetCache
  const { rows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties'
  `)
  facultiesColumnSetCache = new Set((rows || []).map((r) => String(r.column_name)))
  return facultiesColumnSetCache
}

export function buildFacultyDisplayName(first_name, middle_name, last_name, fallback = '') {
  const composed = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim()
  return composed || String(fallback || '').trim() || 'Faculty'
}

export function parseAdvisorySectionsFromFacultiesRow(row) {
  if (Array.isArray(row?.sections)) return row.sections
  const raw = row?.advisory_sections_json
  if (raw == null || raw === '') return []
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export async function buildAdvisorySectionsJson(pool, sectionIds, advisorySections) {
  if (Array.isArray(advisorySections) && advisorySections.length > 0) {
    return JSON.stringify(advisorySections)
  }
  if (!sectionIds.length) return '[]'
  try {
    const { rows } = await pool.query(
      `SELECT id, section_name, grade_level FROM sections WHERE id = ANY($1::int[])`,
      [sectionIds],
    )
    const payload = (rows || []).map((r) => ({
      id: r.id,
      postgresSectionId: Number(r.id),
      section_name: r.section_name,
      grade_level: r.grade_level,
      name: String(r.section_name || '').trim(),
      grade: String(r.grade_level || '').trim(),
    }))
    return JSON.stringify(payload)
  } catch {
    return JSON.stringify(sectionIds.map((id) => ({ id, postgresSectionId: id })))
  }
}

/** Add password_hash / photo_url columns on older `public.faculties` deployments. */
export async function ensureFacultiesExtendedColumns(pool) {
  const additions = [
    ['password_hash', 'TEXT NULL'],
    ['photo_url', 'TEXT NULL'],
    ['grade_level', 'VARCHAR(64) NULL'],
    ['app_password_gmail', 'TEXT NULL'],
    ['employee_id', 'VARCHAR(128) NULL'],
    ['specialization', 'VARCHAR(255) NULL'],
    ['semester', 'VARCHAR(16) NULL'],
    ['address', 'TEXT NULL'],
  ]
  for (const [name, ddl] of additions) {
    try {
      const { rows } = await pool.query(
        `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'faculties' AND column_name = $1
        `,
        [name],
      )
      if (!rows?.length) {
        assertSqlIdentifier(name, 'column name')
        await pool.query(`ALTER TABLE public.faculties ADD COLUMN ${name} ${ddl}`)
        facultiesColumnSetCache = null
      }
    } catch (e) {
      logStatePostgresError(`ensureFacultiesExtendedColumns ${name}`, e)
    }
  }
  await migrateFacultiesLegacyColumns(pool)
}

/** Copy legacy `grade` / `photo_data_url` values into canonical columns when both exist. */
export async function migrateFacultiesLegacyColumns(pool) {
  try {
    const colSet = await getFacultiesColumnSet(pool)
    if (colSet.has('grade_level') && colSet.has('grade')) {
      await pool.query(`
        UPDATE public.faculties
        SET grade_level = COALESCE(NULLIF(BTRIM(grade_level), ''), NULLIF(BTRIM(grade), ''))
        WHERE grade_level IS NULL OR BTRIM(grade_level) = ''
      `)
    }
    if (colSet.has('photo_url') && colSet.has('photo_data_url')) {
      await pool.query(`
        UPDATE public.faculties
        SET photo_url = COALESCE(NULLIF(BTRIM(photo_url), ''), photo_data_url)
        WHERE photo_url IS NULL OR BTRIM(photo_url) = ''
      `)
    }
    if (colSet.has('employee_id') && colSet.has('faculty_code')) {
      await pool.query(`
        UPDATE public.faculties
        SET employee_id = COALESCE(NULLIF(BTRIM(employee_id), ''), NULLIF(BTRIM(faculty_code), ''))
        WHERE employee_id IS NULL OR BTRIM(employee_id) = ''
      `)
    }
    if (colSet.has('specialization') && colSet.has('qualification')) {
      await pool.query(`
        UPDATE public.faculties
        SET specialization = COALESCE(NULLIF(BTRIM(specialization), ''), NULLIF(TRIM(qualification), ''))
        WHERE specialization IS NULL OR BTRIM(specialization) = ''
      `)
    }
  } catch (e) {
    logStatePostgresError('migrateFacultiesLegacyColumns', e)
  }
}

/** Hash login password into password_hash; never persist plaintext in password columns. */
export async function applyFacultyPasswordFields(row, colSet, b, { isUpdate = false } = {}) {
  delete row.password
  const plainPassword = readStudentField(b, 'password', 'password')
  if (!plainPassword) {
    if (isUpdate) {
      delete row.password_hash
    }
    return
  }
  const password_hash = /^\$2[aby]\$\d{2}\$/.test(plainPassword)
    ? plainPassword
    : await hashFacultyPassword(plainPassword)
  if (colSet.has('password_hash')) {
    row.password_hash = password_hash
    if (colSet.has('password')) row.password = null
  } else if (colSet.has('password')) {
    row.password = password_hash
  }
  delete row.password
}

/** Build INSERT/UPDATE column map for `public.faculties` (only existing columns). */
export async function mapBodyToFacultiesRow(pool, b, { sectionIds = [], includeSecrets = true, isUpdate = false } = {}) {
  const colSet = await getFacultiesColumnSet(pool)
  const first_name = readStudentField(b, 'firstName', 'first_name')
  const middle_name = readStudentOptional(b, 'middleName', 'middle_name')
  const last_name = readStudentField(b, 'lastName', 'last_name')
  const email = readStudentField(b, 'email', 'email').toLowerCase()
  const name =
    readStudentField(b, 'name', 'name') ||
    buildFacultyDisplayName(first_name, middle_name, last_name)
  const auth_user_id = readStudentField(b, 'authUserId', 'auth_user_id')
  const row = {
    id: readStudentField(b, 'id', 'id') || randomUUID(),
    name,
    first_name: first_name || null,
    middle_name,
    last_name: last_name || null,
    email,
  }
  if (!isUpdate && auth_user_id) row.auth_user_id = auth_user_id
  const contactVal = readStudentField(b, 'contactNumber', 'contact_number') || null
  if (colSet.has('contact_number')) row.contact_number = contactVal
  if (colSet.has('contact_no')) row.contact_no = contactVal
  const directoryGrade =
    readStudentField(b, 'gradeLevel', 'grade_level') ||
    readStudentField(b, 'grade_level', 'grade_level') ||
    readStudentField(b, 'grade', 'grade') ||
    null
  if (colSet.has('grade_level')) {
    row.grade_level = directoryGrade
  } else if (colSet.has('grade')) {
    row.grade = directoryGrade
  }
  if (colSet.has('qualification')) {
    row.qualification = readStudentField(b, 'qualification', 'qualification') || null
  }
  if (colSet.has('semester')) {
    const semester = readStudentField(b, 'semester', 'semester') || null
    row.semester = semester ? String(semester).trim() : null
  }
  if (colSet.has('address')) {
    row.address = readStudentOptional(b, 'address', 'address') || null
  }
  if (colSet.has('employee_id')) {
    const empId =
      readStudentField(b, 'employeeId', 'employee_id') ||
      readStudentField(b, 'facultyCode', 'faculty_code') ||
      facultyCode ||
      null
    row.employee_id = empId || null
  }
  if (colSet.has('specialization')) {
    row.specialization =
      readStudentField(b, 'specialization', 'specialization') ||
      readStudentField(b, 'qualification', 'qualification') ||
      null
  }
  const facultyCode =
    readStudentField(b, 'facultyCodeId', 'faculty_code_id') ||
    readStudentField(b, 'facultyUsername', 'faculty_username') ||
    readStudentField(b, 'facultyCode', 'faculty_code')
  if (colSet.has('faculty_code')) row.faculty_code = facultyCode || null
  if (colSet.has('faculty_username')) row.faculty_username = facultyCode || null
  const photoValue = readFacultyPhotoUrl(b)
  const photoSent =
    (b?.photo_url != null && String(b.photo_url).trim() !== '') ||
    (b?.photoDataUrl != null && String(b.photoDataUrl).trim() !== '')
  if (colSet.has('photo_url') && (!isUpdate || photoSent)) {
    row.photo_url = photoValue
  } else if (colSet.has('photo_data_url') && (!isUpdate || photoSent)) {
    row.photo_data_url = photoValue
  }
  if (colSet.has('advisory_sections_json')) {
    row.advisory_sections_json = await buildAdvisorySectionsJson(
      pool,
      sectionIds,
      b?.advisorySections,
    )
  }
  if (includeSecrets) {
    await applyFacultyPasswordFields(row, colSet, b, { isUpdate })
    const app_password =
      readStudentField(b, 'appPasswordGmail', 'app_password_gmail') ||
      readStudentField(b, 'appPassword', 'app_password')
    if (app_password) {
      if (colSet.has('app_password_gmail')) row.app_password_gmail = app_password
      else if (colSet.has('app_password')) row.app_password = app_password
    } else if (isUpdate) {
      delete row.app_password_gmail
      delete row.app_password
    }
  }
  return { row, colSet }
}

export function sqlSetClause(keys, startAt = 1) {
  const parts = []
  let n = startAt
  for (const key of keys) {
    parts.push(`${key} = $${n++}`)
  }
  return { text: parts.join(', '), nextIndex: n }
}

export async function insertFacultiesRow(client, row, colSet) {
  const keys = filterFacultyRowKeys(
    Object.keys(row).filter((k) => row[k] !== undefined),
    colSet,
  )
  if (!keys.length) throw new Error('No columns to insert into public.faculties.')
  const values = keys.map((k) => row[k])
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ')
  const sql = `INSERT INTO public.faculties (${keys.join(', ')}) VALUES (${placeholders}) RETURNING *`
  const result = await client.query(sql, values)
  return result.rows?.[0]
}

/** Never mutate primary/relational keys on faculty UPDATE. */
export const FACULTY_UPDATE_PROTECTED_KEYS = new Set(['id', 'auth_user_id'])

export async function updateFacultiesRow(client, id, row, colSet) {
  const keys = filterFacultyRowKeys(
    Object.keys(row).filter(
      (k) => !FACULTY_UPDATE_PROTECTED_KEYS.has(k) && row[k] !== undefined,
    ),
    colSet,
  )
  if (!keys.length) return null
  const photoKey = keys.find((k) => k === 'photo_url')
  if (photoKey) {
    const len = String(row[photoKey] || '').length
    console.log(`[Diagnostic] UPDATE includes ${photoKey} length=${len}`)
  }
  const values = keys.map((k) => row[k])
  const { text: setClause, nextIndex } = sqlSetClause(keys)
  values.push(id)
  const sql = `UPDATE public.faculties SET ${setClause} WHERE id = $${nextIndex} AND archived_at IS NULL RETURNING *`
  console.log('[Diagnostic] Preparing SQL UPDATE query…', { columnCount: keys.length, facultyId: id })
  const result = await client.query(sql, values)
  console.log('[Diagnostic] PostgreSQL UPDATE operation executed successfully!')
  return result.rows?.[0]
}

/** Update `public.faculties` and sync `faculty_sections` in one transaction. */
export async function updateFacultyWithSections(client, facultyId, row, colSet, sectionIds) {
  const id = String(facultyId || '').trim()
  if (!id) throw new Error('Invalid faculty id.')
  delete row.id
  delete row.auth_user_id
  await client.query('BEGIN')
  try {
    const updated = await updateFacultiesRow(client, id, row, colSet)
    if (!updated) {
      await safePgRollback(client)
      return null
    }
    await replaceFacultySections(client, id, sectionIds)
    await client.query('COMMIT')
    return updated
  } catch (e) {
    await safePgRollback(client)
    throw e
  }
}

export const MAX_FACULTY_PHOTO_URL_CHARS = 2_000_000

export function readFacultyPhotoUrl(b) {
  const raw =
    readStudentOptional(b, 'photo_url', 'photo_url') ||
    readStudentOptional(b, 'photoDataUrl', 'photo_url')
  if (!raw) return null
  if (raw.length > MAX_FACULTY_PHOTO_URL_CHARS) {
    console.warn(
      `[state] faculty photo_url truncated (${raw.length} chars > ${MAX_FACULTY_PHOTO_URL_CHARS})`,
    )
    return null
  }
  return raw
}

export async function safePgRollback(client) {
  if (!client) return
  try {
    await client.query('ROLLBACK')
  } catch (e) {
    logStatePostgresError('ROLLBACK', e)
  }
}

/** Fail fast before junction insert when section_ids are invalid. */
export async function assertSectionIdsExist(client, sectionIds) {
  if (!sectionIds.length) return
  const { rows } = await client.query('SELECT id FROM sections WHERE id = ANY($1::int[])', [sectionIds])
  const found = new Set(rows.map((r) => Number(r.id)))
  const missing = sectionIds.filter((id) => !found.has(id))
  if (missing.length) {
    const err = new Error(`One or more section_ids do not exist: ${missing.join(', ')}`)
    err.code = '23503'
    throw err
  }
}

/** Postgres `sections.id` values from request body (ints only). */
export function parseFacultySectionIds(b) {
  const raw = b?.sectionIds ?? b?.section_ids
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => Number(x)).filter((n) => Number.isFinite(n) && n > 0))]
  }
  const adv = b?.advisorySections
  if (Array.isArray(adv)) {
    return [
      ...new Set(
        adv
          .map((s) => Number(s?.postgresSectionId ?? s?.section_id ?? s?.id))
          .filter((n) => Number.isFinite(n) && n > 0),
      ),
    ]
  }
  return []
}

export function parseFacultySectionsJson(row) {
  const raw = row?.sections
  if (Array.isArray(raw)) return raw
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function facultyRowToResponse(row) {
  const sections = parseAdvisorySectionsFromFacultiesRow(row)
  const advisorySections = sections
    .filter((s) => s && (s.id != null || s.postgresSectionId != null))
    .map((s) => {
      const pg = Number(s.postgresSectionId ?? s.id)
      return {
        id: String(s.id ?? s.postgresSectionId ?? ''),
        postgresSectionId: Number.isFinite(pg) && pg > 0 ? pg : undefined,
        name: String(s.section_name || s.name || '').trim(),
        grade_level: sectionGradeLabel(s),
        grade: sectionGradeLabel(s),
      }
    })
  const first_name = String(row.first_name || '').trim()
  const middle_name = String(row.middle_name || '').trim()
  const last_name = String(row.last_name || '').trim()
  const name =
    String(row.name || '').trim() ||
    buildFacultyDisplayName(first_name, middle_name, last_name)
  const faculty_code_id = String(
    row.faculty_code_id || row.faculty_code || row.faculty_username || '',
  ).trim()
  const gradeLevels = collectFacultyGradeLevels(row, advisorySections)
  const photo_url = String(row.photo_url || row.photo_data_url || '').trim()
  const grade_level = gradeLevels[0] || String(row.grade_level || row.grade || '').trim()
  return {
    ...omitFacultySecrets(row),
    id: String(row.id),
    photo_url,
    photoDataUrl: photo_url,
    first_name,
    middle_name,
    last_name,
    name,
    email: String(row.email || '').trim().toLowerCase(),
    contact_number: String(row.contact_number || '').trim(),
    contactNumber: String(row.contact_number || '').trim(),
    qualification: String(row.qualification || '').trim(),
    semester: row.semester != null ? String(row.semester).trim() : '',
    address: row.address != null ? String(row.address).trim() : '',
    faculty_code_id,
    facultyUsername: faculty_code_id,
    facultyCode: faculty_code_id,
    grade_level,
    grade: grade_level,
    gradeLevels,
    advisorySections,
    auth_user_id: row.auth_user_id,
    authUserId: String(row.auth_user_id || '').trim(),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function replaceFacultySections(client, facultyId, sectionIds) {
  const fid = String(facultyId || '').trim()
  if (!fid) return
  await client.query('DELETE FROM faculty_sections WHERE faculty_id = $1', [fid])
  if (!sectionIds.length) return
  await assertSectionIdsExist(client, sectionIds)
  const { text: ph } = pgValuePlaceholders(sectionIds.length, 2, 1)
  const values = sectionIds.flatMap((sid) => [fid, sid])
  await client.query(`INSERT INTO faculty_sections (faculty_id, section_id) VALUES ${ph}`, values)
}

export const FACULTIES_FROM = 'FROM public.faculties'

/** List all columns present on `public.faculties` (works with minimal pgAdmin schemas). */

/** Server-side diagnostics: always prefix Postgres failures for grep-friendly logs. */
export function logStatePostgresError(context, err) {
  const msg = err?.message || err
  const code = err?.code || err?.errno || ''
  console.error(`[state] PostgreSQL Error (${context}):`, msg, code ? `[${code}]` : '')
}

/**
 * One curriculum row from `app_state` JSON — tolerate snake_case, missing keys,
 * and the literal strings "null" / "undefined" (common after bad merges or exports).
 */
export function normalizeCurriculumFromState(raw, index) {
  if (!raw || typeof raw !== 'object') return null
  const nz = (v) => {
    if (v == null) return ''
    const s = String(v).trim()
    if (!s || s === 'null' || s === 'undefined') return ''
    return s
  }
  const id = nz(raw.id) || nz(raw.source_id) || `legacy-${index}`
  const grade = nz(raw.grade) || nz(raw.grade_level)
  const subject = nz(raw.subject) || nz(raw.title)
  const description = nz(raw.description)
  const fileName = nz(raw.fileName) || nz(raw.file_name)
  const fileType = raw.fileType ?? raw.file_type
  const fileDataUrl = raw.fileDataUrl ?? raw.file_data_url
  const uploadedAt = raw.uploadedAt ?? raw.uploaded_at
  const uploadedBy = raw.uploadedBy ?? raw.uploaded_by

  return {
    id,
    grade,
    subject: subject || '(no subject)',
    description,
    fileName,
    fileType: fileType != null && String(fileType).trim() !== '' && String(fileType) !== 'null' ? String(fileType) : '',
    fileDataUrl: fileDataUrl != null && String(fileDataUrl) !== 'null' ? String(fileDataUrl) : '',
    uploadedAt: uploadedAt != null && String(uploadedAt) !== 'null' ? String(uploadedAt) : '',
    uploadedBy: uploadedBy != null && String(uploadedBy) !== 'null' ? String(uploadedBy) : '',
  }
}

/** Real upload name, or subject so DB mirrors stay aligned with the dashboard (no fake “sample” labels). */
export function curriculumFileDisplayName(c) {
  const fn = String(c?.fileName ?? '').trim()
  if (fn) return fn
  const sub = String(c?.subject ?? '').trim()
  if (sub) return sub
  return ''
}

/** Map `public.curriculum` (+ optional guide row) into dashboard `curriculums` item shape. */
export function curriculumPgRowToAppStateMirror(row, guideRow = null) {
  if (!row || typeof row !== 'object') return null
  const sourceId = String(row.source_id || '').trim()
  const id = sourceId || (row.id != null ? String(row.id) : '')
  if (!id) return null
  const g = guideRow && typeof guideRow === 'object' ? guideRow : {}
  return {
    id,
    grade: String(row.grade_level || g.grade || g.grade_level || '').trim(),
    subject: String(row.title || g.subject || '').trim() || '(no subject)',
    description: String(row.description || g.description || '').trim(),
    fileName: String(row.file_name || g.file_name || '').trim(),
    fileType: String(g.file_type || '').trim(),
    fileDataUrl: String(g.file_data_url || '').trim(),
    uploadedAt: g.uploaded_at != null ? String(g.uploaded_at) : '',
    uploadedBy: String(g.uploaded_by || g.uploaded_by_name || '').trim(),
  }
}

/** Merge PostgreSQL curriculum rows into `app_state.curriculums` for backup snapshots. */
export function mergeCurriculumMirrorsIntoAppStateJson(stateJson, mirrors) {
  const base = stateJson && typeof stateJson === 'object' ? { ...stateJson } : {}
  const incoming = Array.isArray(mirrors) ? mirrors.filter(Boolean) : []
  if (!incoming.length) return base
  const byId = new Map()
  for (const c of Array.isArray(base.curriculums) ? base.curriculums : []) {
    const id = String(c?.id || '').trim()
    if (id) byId.set(id, c)
  }
  for (const m of incoming) {
    const id = String(m.id || '').trim()
    if (!id) continue
    byId.set(id, { ...(byId.get(id) || {}), ...m })
  }
  base.curriculums = [...byId.values()]
  return base
}

/** Map `public.sections` row into dashboard `sections` item shape. */
export function sectionPgRowToAppStateMirror(row) {
  if (!row || typeof row !== 'object') return null
  const pgId = row.id != null ? Number(row.id) : NaN
  const grade = String(row.grade_level || row.grade || '').trim()
  const name = String(row.section_name || row.name || '').trim()
  if (!name && !Number.isFinite(pgId)) return null
  const id = String(row.source_id || row.id || '').trim() || (Number.isFinite(pgId) ? String(pgId) : '')
  if (!id) return null
  return {
    id,
    postgresSectionId: Number.isFinite(pgId) && pgId > 0 ? pgId : undefined,
    grade,
    name,
    students: Number.isFinite(Number(row.student_count)) ? Number(row.student_count) : 0,
  }
}

/** Merge PostgreSQL section rows into `app_state.sections` for backup snapshots. */
export function mergeSectionMirrorsIntoAppStateJson(stateJson, mirrors) {
  const base = stateJson && typeof stateJson === 'object' ? { ...stateJson } : {}
  const incoming = Array.isArray(mirrors) ? mirrors.filter(Boolean) : []
  if (!incoming.length) return base
  const byKey = new Map()
  const keyOf = (s) => {
    const pg = Number(s?.postgresSectionId ?? s?.id)
    if (Number.isFinite(pg) && pg > 0) return `pg:${pg}`
    return `id:${String(s?.id || '').trim()}`
  }
  for (const s of Array.isArray(base.sections) ? base.sections : []) {
    const k = keyOf(s)
    if (k !== 'id:') byKey.set(k, s)
  }
  for (const m of incoming) {
    const k = keyOf(m)
    if (k === 'id:') continue
    byKey.set(k, { ...(byKey.get(k) || {}), ...m })
  }
  base.sections = [...byKey.values()]
  return base
}

/** Remove one curriculum guide from institute app_state JSON (by app id / source_id). */
export async function purgeCurriculumFromAppStateJson(client, curriculumId) {
  const id = String(curriculumId || '').trim()
  if (!id) return
  try {
    const parsed = await loadAppStateJson(client)
    if (!Array.isArray(parsed.curriculums)) return
    const next = parsed.curriculums.filter((c) => String(c?.id || '').trim() !== id)
    if (next.length === parsed.curriculums.length) return
    parsed.curriculums = next
    await client.query(
      `UPDATE app_state SET json = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(parsed), STATE_ID],
    )
  } catch (e) {
    logStatePostgresError('purgeCurriculumFromAppStateJson', e)
  }
}

/** @param {number} rowCount @param {number} colCount @param {number} [startAt] */
export function pgValuePlaceholders(rowCount, colCount, startAt = 1) {
  const chunks = []
  let n = startAt
  for (let r = 0; r < rowCount; r++) {
    const cells = []
    for (let c = 0; c < colCount; c++) {
      cells.push(`$${n++}`)
    }
    chunks.push(`(${cells.join(', ')})`)
  }
  return { text: chunks.join(', '), nextIndex: n }
}

export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      json TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS faculties (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      auth_user_id VARCHAR(64) NULL,
      name VARCHAR(255) NOT NULL,
      first_name VARCHAR(128) NULL,
      middle_name VARCHAR(128) NULL,
      last_name VARCHAR(128) NULL,
      email VARCHAR(255) NOT NULL,
      contact_number VARCHAR(64) NULL,
      grade VARCHAR(64) NULL,
      qualification VARCHAR(255) NULL,
      faculty_code VARCHAR(64) NULL,
      faculty_username VARCHAR(128) NULL,
      password VARCHAR(255) NULL,
      app_password VARCHAR(255) NULL,
      photo_data_url TEXT NULL,
      advisory_sections_json TEXT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  facultiesColumnSetCache = null
  await ensureFacultiesExtendedColumns(pool)

  const { rows: colRows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties' AND column_name = 'auth_user_id'
  `)
  if (!colRows?.length) {
    await pool.query(`ALTER TABLE faculties ADD COLUMN auth_user_id VARCHAR(64) NULL`)
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS institute_sections (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      grade VARCHAR(64) NOT NULL,
      name VARCHAR(255) NOT NULL,
      student_count INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculum_guides (
      id VARCHAR(64) NOT NULL PRIMARY KEY,
      grade VARCHAR(64) NOT NULL,
      subject VARCHAR(255) NOT NULL,
      description TEXT NOT NULL,
      file_name VARCHAR(512) NOT NULL,
      file_type VARCHAR(255) NULL,
      file_data_url TEXT NULL,
      uploaded_at VARCHAR(128) NULL,
      uploaded_by VARCHAR(255) NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS curriculum (
      id SERIAL PRIMARY KEY,
      title VARCHAR(512) NOT NULL,
      description TEXT NOT NULL,
      grade_level VARCHAR(64) NOT NULL,
      file_name VARCHAR(512) NULL,
      source_id VARCHAR(64) NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await pool.query(`CREATE INDEX IF NOT EXISTS idx_curriculum_grade_level ON curriculum (grade_level)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_curriculum_created_at ON curriculum (created_at)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_curriculum_source_id ON curriculum (source_id)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sections (
      id SERIAL PRIMARY KEY,
      section_name VARCHAR(255),
      grade_level VARCHAR(50),
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sections_grade_level ON sections (grade_level)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_sections_created_at ON sections (created_at)`)

  await pool.query(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      photo_url TEXT,
      first_name TEXT,
      middle_name TEXT,
      last_name TEXT,
      email TEXT UNIQUE,
      contact_no TEXT,
      address TEXT,
      dob DATE,
      parent_contact TEXT,
      parent_email TEXT,
      enrollment_no TEXT UNIQUE,
      roll_no TEXT,
      grade_level TEXT,
      semester TEXT,
      section_id INT REFERENCES sections(id) ON DELETE SET NULL,
      login_id TEXT UNIQUE,
      password_hash TEXT,
      app_password_gmail TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_students_section_id ON students (section_id)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_students_email ON students (email)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_students_login_id ON students (login_id)`)

  await ensureStudentsCatalogColumns(pool)

  await ensureSectionsCatalogColumns(pool)

  await ensureCurriculumManifestColumns(pool)

  await ensureCurriculumGuidesPublishColumns(pool)

  await ensureFacultyCatalogTables(pool)

  await ensureSubjectsTable(pool)

  const { ensureSubjectSchedulesSchema, ensureSubjectsCurriculumGuideColumn, seedDemoSubjectSchedules } =
    await import('../../lib/subjectSchedulesDb.js')
  await ensureSubjectsCurriculumGuideColumn(pool)
  await ensureSubjectSchedulesSchema(pool)
  try {
    await seedDemoSubjectSchedules(pool)
  } catch (e) {
    logStatePostgresError('seedDemoSubjectSchedules', e)
  }

  await ensureAnnouncementsTable(pool)

  await ensureArchivedAtColumns(pool)

  await ensureOperationalArchivedAtColumns(pool)

  await ensureTeacherDashboardAggregateTables(pool)
}

/** Ensures `archived_at` on operational LMS tables (subjects, announcements, etc.). */
export async function ensureOperationalArchivedAtColumns(pool) {
  const tables = [
    'subjects',
    'announcements',
    'curriculum_guides',
    'quizzes',
    'assignments',
    'activities',
    'study_materials',
    'subject_materials',
  ]
  for (const table of tables) {
    try {
      await pool.query(
        `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`,
      )
    } catch (e) {
      logStatePostgresError(`ensureOperationalArchivedAtColumns ${table}`, e)
    }
  }
  console.log('[DB] archived_at columns verified on all operational tables')
}

/** Rows for faculty-scoped LMS stats (assignments counts). */
export async function ensureTeacherDashboardAggregateTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS assignments (
      id BIGSERIAL PRIMARY KEY,
      faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_assignments_faculty_id ON public.assignments (faculty_id)`)
}

/** Ensures `archived_at` exists on roster tables for soft-archive + retention purge. */
export async function ensureArchivedAtColumns(pool) {
  for (const table of ['students', 'faculties']) {
    try {
      const { rows } = await pool.query(
        `
          SELECT column_name FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = 'archived_at'
        `,
        [table],
      )
      if (!rows?.length) {
        await pool.query(
          `ALTER TABLE public.${table} ADD COLUMN archived_at TIMESTAMPTZ NULL`,
        )
        await pool.query(
          `CREATE INDEX IF NOT EXISTS idx_${table}_archived_at ON public.${table} (archived_at) WHERE archived_at IS NOT NULL`,
        )
        if (table === 'faculties') facultiesColumnSetCache = null
      }
    } catch (e) {
      logStatePostgresError(`ensureArchivedAtColumns ${table}`, e)
    }
  }
}

export async function requireAdminSession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, message: 'Admin auth is not available.' })
    return null
  }
  try {
    const session = await auth.api.getSession({ headers: req.headers })
    const role = String(session?.user?.role || session?.data?.user?.role || '')
      .trim()
      .toLowerCase()
    if (!session?.user?.id || role !== 'admin') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Institute admin session required',
        requiredRole: 'admin',
      })
      res.status(403).json({
        success: false,
        error: 'FORBIDDEN',
        message: 'Access denied. Admin only.',
      })
      return null
    }
    if (!isTermsExemptRequest(req)) {
      const pool = getPgPool()
      if (pool) {
        const termsRow = await fetchAdminTermsRow(pool, session.user.id)
        if (!adminTermsAccepted(termsRow)) {
          sendTermsNotAccepted(res, 'admin portal')
          return null
        }
      }
    }
    return session
  } catch (e) {
    sendSafeServerError(res, e, 'requireAdminSession')
    return null
  }
}

export function parseArchiveEntityType(raw) {
  const type = String(raw || '')
    .trim()
    .toLowerCase()
  if (!ARCHIVE_ENTITY_TYPES.has(type)) return null
  return type
}

export async function archiveStudentRecord(pool, id) {
  const r = await pool.query(
    'UPDATE students SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL',
    [id],
  )
  return Number(r?.rowCount ?? 0) > 0
}

export async function archiveFacultyRecord(pool, id) {
  const r = await pool.query(
    `UPDATE public.faculties SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL`,
    [id],
  )
  return Number(r?.rowCount ?? 0) > 0
}

export const VAULT_OBFUSCATED_LABEL = 'HIDDEN/ARCHIVED'

export function buildVaultStudentDisplayName(row) {
  return studentDisplayName(row) || VAULT_OBFUSCATED_LABEL
}

/** Archive Vault API: expose only display name + id + archived_at; mask all other identifiers. */
export function obfuscateArchivedStudentForVault(row) {
  const decrypted = decryptStudentPiiFields(row)
  const archived_at = decrypted.archived_at
  const retention = computeArchiveRetention(archived_at)
  return {
    id: decrypted.id,
    name: buildVaultStudentDisplayName(decrypted),
    first_name: String(decrypted.first_name || '').trim(),
    middle_name: String(decrypted.middle_name || '').trim(),
    last_name: String(decrypted.last_name || '').trim(),
    archived_at,
    archivedAt: archived_at,
    ...retention,
    email: VAULT_OBFUSCATED_LABEL,
    contact_no: VAULT_OBFUSCATED_LABEL,
    contact_number: VAULT_OBFUSCATED_LABEL,
    enrollment_no: VAULT_OBFUSCATED_LABEL,
    roll_no: VAULT_OBFUSCATED_LABEL,
    section_name: VAULT_OBFUSCATED_LABEL,
    grade_level: VAULT_OBFUSCATED_LABEL,
    photo_url: null,
    fieldsObfuscated: true,
  }
}

export function obfuscateArchivedFacultyForVault(row) {
  const first_name = String(row.first_name || '').trim()
  const middle_name = String(row.middle_name || '').trim()
  const last_name = String(row.last_name || '').trim()
  const name =
    String(row.name || '').trim() ||
    buildFacultyDisplayName(first_name, middle_name, last_name, '') ||
    VAULT_OBFUSCATED_LABEL
  const archived_at = row.archived_at
  const retention = computeArchiveRetention(archived_at)
  return {
    id: String(row.id),
    name,
    first_name,
    middle_name,
    last_name,
    archived_at,
    archivedAt: archived_at,
    ...retention,
    email: VAULT_OBFUSCATED_LABEL,
    contact_number: VAULT_OBFUSCATED_LABEL,
    contactNumber: VAULT_OBFUSCATED_LABEL,
    grade_level: VAULT_OBFUSCATED_LABEL,
    grade: VAULT_OBFUSCATED_LABEL,
    advisorySections: [],
    sectionsLabel: VAULT_OBFUSCATED_LABEL,
    photo_url: null,
    photoDataUrl: null,
    fieldsObfuscated: true,
  }
}

export const TYPES = new Set(['Institute', 'Campus', 'Announcement', 'Event', 'News'])
export const ANNOUNCEMENT_TYPES = TYPES

export function announcementPgError(res, e) {
  sendSafeServerError(res, e, 'announcements')
}

export async function ensureAnnouncementsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS announcements (
      id SERIAL PRIMARY KEY,
      announcement_image TEXT,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_announcements_created_at ON announcements (created_at DESC)`,
  )
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements (type)`)
  await ensureAnnouncementsMetadataColumns(pool)
}

export const MAX_SUBJECT_SYLLABUS_CHARS = 8_000_000

export function normalizeSubjectTextField(raw, maxChars, label) {
  if (raw == null || raw === '') return null
  const s = String(raw)
  if (s.length > maxChars) {
    console.warn(`[state] subject ${label} truncated (${s.length} chars > ${maxChars})`)
    return s.slice(0, maxChars)
  }
  return s
}

export function readSubjectSyllabus(b) {
  const raw =
    b?.syllabusDataUrl ?? b?.syllabus_data_url ?? b?.syllabus_pdf ?? b?.syllabusPdf ?? ''
  return normalizeSubjectTextField(raw, MAX_SUBJECT_SYLLABUS_CHARS, 'syllabus_pdf')
}

export function readSubjectBodyFields(b) {
  const subject_code = readStudentField(b, 'subjectCode', 'subject_code')
  const subject_name = readStudentField(b, 'subjectName', 'subject_name')
  const grade_level =
    readStudentField(b, 'gradeLevel', 'grade_level') || readStudentField(b, 'grade', 'grade')
  const semester = normalizeSubjectSemester(b?.semester)
  const faculty_id =
    readStudentField(b, 'assignedFacultyId', 'assigned_faculty_id') ||
    readStudentField(b, 'facultyId', 'faculty_id')
  const curriculum_guide_id =
    readStudentField(b, 'curriculumGuideId', 'curriculum_guide_id') || null
  const syllabus_pdf = readSubjectSyllabus(b)
  const schedule_day_of_week = b?.scheduleDayOfWeek ?? b?.schedule_day_of_week
  const schedule_start_time = String(b?.scheduleStartTime ?? b?.schedule_start_time ?? '').trim()
  const schedule_end_time = String(b?.scheduleEndTime ?? b?.schedule_end_time ?? '').trim()
  const schedule_room = String(b?.scheduleRoom ?? b?.schedule_room ?? '').trim()
  return {
    subject_code,
    subject_name,
    grade_level,
    semester,
    faculty_id,
    curriculum_guide_id,
    syllabus_pdf,
    schedule:
      schedule_day_of_week != null && schedule_day_of_week !== ''
        ? {
            day_of_week: Number(schedule_day_of_week),
            start_time: schedule_start_time,
            end_time: schedule_end_time,
            room: schedule_room,
          }
        : null,
  }
}

export function subjectPgError(res, e) {
  sendSafeServerError(res, e, 'subjects')
}

export function normalizeSubjectSemester(raw) {
  const q = String(raw ?? '').trim()
  if (!q) return ''
  const n = Number(q)
  if (Number.isFinite(n) && n >= 1 && n <= 3) return String(n)
  return q.slice(0, 16)
}

export function subjectRowToResponse(row) {
  if (!row) return null
  const semesterRaw = row.semester
  const semesterNum = Number(semesterRaw)
  const semester =
    Number.isFinite(semesterNum) && semesterRaw != null && String(semesterRaw).trim() !== ''
      ? semesterNum
      : semesterRaw
  const storedPhoto = String(row.subject_photo ?? '').trim()
  const subjectPhoto =
    storedPhoto || resolveSubjectImagePath(String(row.subject_name ?? '').trim())
  return {
    id: row.id != null ? Number(row.id) : row.id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    grade: row.grade_level,
    grade_level: row.grade_level,
    semester,
    assignedFacultyId: row.faculty_id ?? '',
    faculty_id: row.faculty_id ?? '',
    assignedFacultyName: String(row.faculty_name ?? '').trim(),
    syllabusDataUrl: row.syllabus_pdf ?? '',
    syllabus_pdf: row.syllabus_pdf ?? '',
    subjectPhoto,
    subject_photo: subjectPhoto,
    cover_image_url: subjectPhoto,
    faculty_name: String(row.faculty_name ?? '').trim(),
    curriculumGuideId: row.curriculum_guide_id ?? '',
    curriculum_guide_id: row.curriculum_guide_id ?? '',
    curriculumGuideTitle: String(row.curriculum_guide_title ?? '').trim(),
    schedule: row.schedule ?? null,
    schedules: Array.isArray(row.schedules) ? row.schedules : row.schedule ? [row.schedule] : [],
    createdAt: row.created_at,
    created_at: row.created_at,
  }
}

export async function ensureSubjectsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      subject_photo TEXT,
      subject_code VARCHAR(50) UNIQUE NOT NULL,
      subject_name VARCHAR(255) NOT NULL,
      grade_level VARCHAR(64) NOT NULL,
      semester VARCHAR(16) NOT NULL,
      faculty_id VARCHAR(64) REFERENCES faculties(id) ON DELETE SET NULL,
      syllabus_pdf TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_grade_level ON subjects (grade_level)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_semester ON subjects (semester)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_faculty_id ON subjects (faculty_id)`)
}

/** Advisory section junction for canonical `public.faculties` roster rows. */
export async function ensureFacultyCatalogTables(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS faculty_sections (
      faculty_id VARCHAR(64) NOT NULL REFERENCES public.faculties(id) ON DELETE CASCADE,
      section_id INT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      PRIMARY KEY (faculty_id, section_id)
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_faculty_sections_section ON faculty_sections (section_id)`)
}

/** Migrate legacy `students` column names (`student_photo_url`, `contact_number`) to `photo_url`, `contact_no`. */
export async function ensureStudentsCatalogColumns(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'students'
    `)
    if (!rows?.length) return
    const cols = new Set(rows.map((r) => r.column_name))
    if (cols.has('student_photo_url') && !cols.has('photo_url')) {
      await pool.query(`ALTER TABLE students RENAME COLUMN student_photo_url TO photo_url`)
      cols.delete('student_photo_url')
      cols.add('photo_url')
    }
    if (!cols.has('photo_url')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT`)
      cols.add('photo_url')
    }
    if (cols.has('contact_number') && !cols.has('contact_no')) {
      await pool.query(`ALTER TABLE students RENAME COLUMN contact_number TO contact_no`)
      cols.delete('contact_number')
      cols.add('contact_no')
    }
    if (!cols.has('contact_no')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS contact_no TEXT`)
    }
    if (!cols.has('archived_at')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ NULL`)
    }
    if (!cols.has('terms_accepted')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false`)
    }
    if (!cols.has('terms_accepted_at')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ NULL`)
    }
    if (!cols.has('auth_user_id')) {
      await pool.query(`ALTER TABLE students ADD COLUMN IF NOT EXISTS auth_user_id VARCHAR(64) NULL`)
      cols.add('auth_user_id')
    }
  } catch (e) {
    logStatePostgresError('ensureStudentsCatalogColumns', e)
  }
}

/** Widen legacy TEXT columns on `sections` if present; does not force NOT NULL (matches catalog DDL). */
export async function ensureSectionsCatalogColumns(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'sections'
    `)
    if (!rows?.length) return
    const by = new Map(rows.map((r) => [r.column_name, r]))
    const sn = by.get('section_name')
    const gl = by.get('grade_level')
    if (sn?.data_type === 'text') {
      await pool.query(`
        ALTER TABLE sections
        ALTER COLUMN section_name TYPE VARCHAR(255) USING left(btrim(COALESCE(section_name, '')), 255)
      `)
    }
    if (gl?.data_type === 'text') {
      await pool.query(`
        ALTER TABLE sections
        ALTER COLUMN grade_level TYPE VARCHAR(50) USING left(btrim(COALESCE(grade_level, '')), 50)
      `)
    }
  } catch (e) {
    logStatePostgresError('ensureSectionsCatalogColumns', e)
  }
}

/** Add columns introduced after first deploy (older DBs only had title/description/grade_level). */
export async function ensureCurriculumManifestColumns(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'curriculum'
    `)
    const names = new Set((rows || []).map((r) => r.column_name))
    if (!names.has('file_name')) {
      await pool.query(`ALTER TABLE curriculum ADD COLUMN file_name VARCHAR(512) NULL`)
    }
    if (!names.has('source_id')) {
      await pool.query(`ALTER TABLE curriculum ADD COLUMN source_id VARCHAR(64) NULL`)
      await pool.query(`CREATE INDEX IF NOT EXISTS idx_curriculum_source_id ON curriculum (source_id)`)
    }
  } catch (e) {
    logStatePostgresError('ensureCurriculumManifestColumns', e)
  }
}

/** Shape expected by `syncFaculties` / backup app_state snapshot. */
export function facultyPgRowToAppStateMirror(row) {
  if (!row || typeof row !== 'object') return null
  const id = String(row.id || '').trim()
  if (!id) return null
  const advisorySections = parseAdvisorySectionsFromFacultiesRow(row)
  const facultyCode = String(
    row.faculty_code_id || row.faculty_code || row.faculty_username || '',
  ).trim()
  return {
    id,
    authUserId: String(row.auth_user_id || '').trim() || null,
    name: String(row.name || '').trim(),
    firstName: row.first_name ? String(row.first_name) : null,
    middleName: row.middle_name ? String(row.middle_name) : null,
    lastName: row.last_name ? String(row.last_name) : null,
    email: String(row.email || '').trim(),
    contactNumber: row.contact_number || row.contact_no || null,
    grade: row.grade_level || row.grade || null,
    qualification: row.qualification || null,
    facultyCode,
    facultyUsername: facultyCode,
    photoDataUrl: String(row.photo_url || row.photo_data_url || '').trim(),
    advisorySections,
  }
}

async function loadAppStateJson(client) {
  const { rows } = await client.query('SELECT json FROM app_state WHERE id = $1 LIMIT 1', [
    STATE_ID,
  ])
  const raw = rows?.[0]?.json
  if (!raw) return {}
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

/** Merge canonical PostgreSQL faculty row into institute app_state JSON (server-mode mirror). */
export async function upsertFacultyInAppStateJson(client, pgRow) {
  const mirror = facultyPgRowToAppStateMirror(pgRow)
  if (!mirror?.id) return
  try {
    const parsed = await loadAppStateJson(client)
    if (!Array.isArray(parsed.faculties)) parsed.faculties = []
    const idx = parsed.faculties.findIndex((f) => String(f?.id || '').trim() === mirror.id)
    if (idx >= 0) parsed.faculties[idx] = { ...parsed.faculties[idx], ...mirror }
    else parsed.faculties.unshift(mirror)
    await client.query(
      `
        INSERT INTO app_state (id, json, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = NOW()
      `,
      [STATE_ID, JSON.stringify(parsed)],
    )
  } catch (e) {
    logStatePostgresError('upsertFacultyInAppStateJson', e)
  }
}

/** Merge active public.faculties rows into app_state.faculties for backup snapshots. */
export function mergeFacultyMirrorsIntoAppStateJson(stateJson, mirrors) {
  const base = stateJson && typeof stateJson === 'object' ? { ...stateJson } : {}
  const incoming = Array.isArray(mirrors) ? mirrors.filter(Boolean) : []
  if (!incoming.length) return base
  const byId = new Map()
  for (const f of Array.isArray(base.faculties) ? base.faculties : []) {
    const id = String(f?.id || '').trim()
    if (id) byId.set(id, f)
  }
  for (const m of incoming) {
    const id = String(m.id || '').trim()
    if (!id) continue
    byId.set(id, { ...(byId.get(id) || {}), ...m })
  }
  base.faculties = [...byId.values()]
  return base
}

export async function purgeFacultyFromAppStateJson(client, facultyId) {
  const id = String(facultyId || '').trim()
  if (!id) return
  try {
    const parsed = await loadAppStateJson(client)
    if (!Array.isArray(parsed.faculties)) return
    const next = parsed.faculties.filter((f) => String(f?.id || '').trim() !== id)
    if (next.length === parsed.faculties.length) return
    parsed.faculties = next
    await client.query(
      `UPDATE app_state SET json = $1, updated_at = NOW() WHERE id = $2`,
      [JSON.stringify(parsed), STATE_ID],
    )
  } catch (e) {
    logStatePostgresError('purgeFacultyFromAppStateJson', e)
  }
}

export async function syncFaculties(client, state) {
  const faculties = Array.isArray(state?.faculties) ? state.faculties : []
  if (faculties.length === 0) return

  for (const f of faculties) {
    const id = String(f.id || '').trim()
    if (!id) continue

    const { rows: existingRows } = await client.query(
      `SELECT archived_at FROM public.faculties WHERE id = $1 LIMIT 1`,
      [id],
    )
    if (existingRows?.[0]?.archived_at) continue

    const plainPw = f.password ? String(f.password).trim() : ''
    let passwordStored = null
    if (plainPw) {
      passwordStored = /^\$2[aby]\$\d{2}\$/.test(plainPw) ? plainPw : await hashFacultyPassword(plainPw)
    }

    await client.query(
      `
      INSERT INTO public.faculties (
        id, auth_user_id, name, first_name, middle_name, last_name, email,
        contact_number, grade, qualification, faculty_code, faculty_username,
        password, app_password, photo_data_url, advisory_sections_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
      ON CONFLICT (id) DO UPDATE SET
        auth_user_id = EXCLUDED.auth_user_id,
        name = EXCLUDED.name,
        first_name = EXCLUDED.first_name,
        middle_name = EXCLUDED.middle_name,
        last_name = EXCLUDED.last_name,
        email = EXCLUDED.email,
        contact_number = EXCLUDED.contact_number,
        grade = EXCLUDED.grade,
        qualification = EXCLUDED.qualification,
        faculty_code = EXCLUDED.faculty_code,
        faculty_username = EXCLUDED.faculty_username,
        password = COALESCE(EXCLUDED.password, public.faculties.password),
        app_password = EXCLUDED.app_password,
        photo_data_url = EXCLUDED.photo_data_url,
        advisory_sections_json = EXCLUDED.advisory_sections_json
      WHERE public.faculties.archived_at IS NULL
      `,
      [
        id,
        f.authUserId ? String(f.authUserId) : null,
        String(f.name || '').trim(),
        f.firstName ? String(f.firstName) : null,
        f.middleName ? String(f.middleName) : null,
        f.lastName ? String(f.lastName) : null,
        String(f.email || '').trim(),
        f.contactNumber ? String(f.contactNumber) : null,
        f.grade ? String(f.grade) : null,
        f.qualification ? String(f.qualification) : null,
        String(f.facultyCode || '').trim(),
        String(f.facultyUsername || f.username || '').trim(),
        passwordStored,
        f.appPassword ? String(f.appPassword) : null,
        f.photoDataUrl ? String(f.photoDataUrl) : null,
        JSON.stringify(f.advisorySections || []),
      ],
    )
  }
}

/**
 * Rebuild institute mirror tables from restored app_state (backup restore path).
 * Mirrors PUT /v1/state sync without local-only faculty gating.
 */
export async function syncAppStateMirrorsAfterRestore(client, stateJson) {
  const counts = { synced_faculties: 0, synced_sections: 0, synced_curriculums: 0 }
  if (!stateJson || typeof stateJson !== 'object') return counts

  const faculties = Array.isArray(stateJson.faculties) ? stateJson.faculties : []
  if (faculties.length > 0) {
    await syncFaculties(client, stateJson)
    counts.synced_faculties = faculties.length
    console.warn(
      `[BACKUP] Synced ${counts.synced_faculties} faculty row(s) from app_state into public.faculties`,
    )
  }

  const sections = Array.isArray(stateJson.sections) ? stateJson.sections : []
  if (sections.length > 0) {
    await syncSections(client, stateJson)
    counts.synced_sections = sections.length
    console.warn(
      `[BACKUP] Synced ${counts.synced_sections} section(s) from app_state into institute_sections`,
    )
  }

  const curriculums = Array.isArray(stateJson.curriculums) ? stateJson.curriculums : []
  if (curriculums.length > 0) {
    await syncCurriculumManifest(client, stateJson)
    await syncCurriculums(client, stateJson)
    counts.synced_curriculums = curriculums.length
    console.warn(
      `[BACKUP] Synced ${counts.synced_curriculums} curriculum guide(s) from app_state into public.curriculum and curriculum_guides`,
    )
  }

  return counts
}

export async function syncSections(client, state) {
  const sections = Array.isArray(state?.sections) ? state.sections : []
  await client.query('DELETE FROM institute_sections')
  if (sections.length === 0) return

  const rows = sections.map((s) => [
    String(s.id || ''),
    String(s.grade || ''),
    String(s.name || ''),
    Number.isFinite(Number(s.students)) ? Number(s.students) : 0,
  ])

  const { text: ph } = pgValuePlaceholders(rows.length, 4)
  await client.query(`INSERT INTO institute_sections (id, grade, name, student_count) VALUES ${ph}`, rows.flat())
}

export async function syncCurriculums(client, state) {
  const rawList = Array.isArray(state?.curriculums) ? state.curriculums : []
  await client.query(`DELETE FROM curriculum_guides WHERE COALESCE(source, 'app_state') = 'app_state'`)
  const curriculums = rawList.map((c, i) => normalizeCurriculumFromState(c, i)).filter(Boolean)
  if (curriculums.length === 0) return

  const rows = curriculums.map((c) => [
    String(c.id || ''),
    String(c.grade || ''),
    String(c.subject || ''),
    String(c.description || ''),
    String(curriculumFileDisplayName(c) || 'Curriculum guide'),
    c.fileType ? String(c.fileType) : null,
    c.fileDataUrl ? String(c.fileDataUrl) : null,
    c.uploadedAt ? String(c.uploadedAt) : null,
    c.uploadedBy ? String(c.uploadedBy) : null,
    String(c.subject || curriculumFileDisplayName(c) || 'Curriculum guide'),
    c.fileDataUrl ? String(c.fileDataUrl) : null,
    String(c.grade || ''),
    true,
    c.uploadedBy ? String(c.uploadedBy) : null,
    'app_state',
  ])

  const { text: ph } = pgValuePlaceholders(rows.length, 15)
  await client.query(
    `
      INSERT INTO curriculum_guides (
        id, grade, subject, description, file_name, file_type, file_data_url, uploaded_at, uploaded_by,
        title, file_url, grade_level, is_published, uploaded_by_name, source
      ) VALUES ${ph}
    `,
    rows.flat(),
  )
}

/** Workbench-friendly mirror of `state.curriculums` (title=subject, file_name, source_id=app row id). */
export async function syncCurriculumManifest(client, state) {
  const rawList = Array.isArray(state?.curriculums) ? state.curriculums : []
  await client.query('DELETE FROM curriculum')
  const curriculums = rawList.map((c, i) => normalizeCurriculumFromState(c, i)).filter(Boolean)
  if (curriculums.length === 0) return

  const rows = curriculums.map((c, idx) => {
    const title = String(c.subject || '').trim() || '(no subject)'
    const description = String(c.description || '')
    const grade_level = String(c.grade || '').trim() || ''
    const file_name = curriculumFileDisplayName(c) || null
    const source_id = String(c.id || '').trim() || `legacy-${idx}`
    return [title, description, grade_level, file_name, source_id]
  })

  const { text: ph } = pgValuePlaceholders(rows.length, 5)
  await client.query(
    `INSERT INTO curriculum (title, description, grade_level, file_name, source_id) VALUES ${ph}`,
    rows.flat(),
  )
}

export async function backfillMirrorTables(pool) {
  try {
    const { rows } = await pool.query('SELECT json FROM app_state WHERE id = $1', [STATE_ID])
    const raw = rows?.[0]?.json
    if (!raw) return
    let state
    try {
      state = JSON.parse(raw)
    } catch {
      return
    }

    const { rows: secCnt } = await pool.query('SELECT COUNT(*)::int AS n FROM institute_sections')
    const { rows: curCnt } = await pool.query('SELECT COUNT(*)::int AS n FROM curriculum_guides')
    const { rows: manCnt } = await pool.query('SELECT COUNT(*)::int AS n FROM curriculum')

    const needSec = Number(secCnt[0]?.n ?? 0) === 0
    const needCur = Number(curCnt[0]?.n ?? 0) === 0
    const needMan = Number(manCnt[0]?.n ?? 0) === 0
    if (!needSec && !needCur && !needMan) return

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      if (needSec) await syncSections(client, state)
      if (needCur) {
        await syncCurriculums(client, state)
        await syncCurriculumManifest(client, state)
      } else if (needMan) {
        await syncCurriculumManifest(client, state)
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK')
      logStatePostgresError('mirror backfill (transaction)', e)
    } finally {
      client.release()
    }
  } catch (e) {
    logStatePostgresError('mirror backfill skipped', e)
  }
}

export async function noopClose() {}
