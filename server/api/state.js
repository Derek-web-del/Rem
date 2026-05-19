import { randomUUID } from 'node:crypto'
import bcrypt from 'bcrypt'
import { findAuthUserIdByEmail } from './logs.js'
import { getPgPool, isPgConfigured } from '../pgPool.js'
import {
  buildFacultyAuditTargetName,
  buildFacultyComparePayload,
  computeFacultyProfileDetailedDiffs,
  fetchFacultyPriorState,
} from '../lib/facultyProfileAudit.js'
import {
  buildStudentAuditTargetName,
  computeStudentProfileDetailedDiffs,
} from '../lib/studentProfileAudit.js'
import { customActivityLogger } from '../services/CustomActivityLogger.js'
import {
  facultyPhotoUploadMiddleware,
  getFacultyUploadFile,
  normalizeFacultyMultipartBody,
} from '../lib/facultyMultipart.js'
import { resolveFacultyPhotoForDb } from '../lib/facultyPhotoStorage.js'
import { resolveSubjectImagePath } from '../lib/subjectImageStorage.js'
import { ensureCurriculumGuidesPublishColumns } from '../lib/curriculumGuidesDb.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../lib/safeApiError.js'
import {
  ensureRecordIntegrityColumns,
  extendUpdateSetWithIntegrity,
  stampRowLastModified,
} from '../lib/recordIntegrity.js'
import { logUnauthorizedAccessFromRequest, requireDestructiveConfirm } from '../lib/security.js'
import {
  announcementRowToResponse,
  ensureAnnouncementsMetadataColumns,
  maybeDeleteOldAnnouncementFile,
  readAnnouncementBodyFields,
  resolveAnnouncementImageForSave,
  resolveSessionUploadedByLabel,
} from '../lib/announcementsDb.js'
import {
  ARCHIVE_ENTITY_TYPES,
  assertSqlIdentifier,
  filterFacultyRowKeys,
  resolveArchiveTableSql,
} from '../lib/sqlGuards.js'

const STATE_ID = 'default'
const BCRYPT_ROUNDS = 12

async function hashStudentPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

async function hashFacultyPassword(plain) {
  return bcrypt.hash(String(plain), BCRYPT_ROUNDS)
}

function omitStudentPassword(row) {
  if (!row || typeof row !== 'object') return row
  const { password_hash: _p, ...rest } = row
  return rest
}

async function auditInstituteRecord(adminSession, activityType, payload = {}) {
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

function readStudentField(b, camel, snake) {
  const a = b?.[camel]
  const c = b?.[snake]
  const x = a != null && String(a).trim() !== '' ? a : c
  if (x == null) return ''
  return String(x).trim()
}

function readStudentOptional(b, camel, snake) {
  const s = readStudentField(b, camel, snake)
  return s || null
}

function parseStudentSectionId(b) {
  const v = b?.sectionId ?? b?.section_id
  if (v == null || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

function parseStudentDob(b) {
  const s =
    readStudentField(b, 'dob', 'date_of_birth') ||
    readStudentField(b, 'dateOfBirth', 'date_of_birth')
  if (!s) return { ok: false, error: 'Date of birth is required (YYYY-MM-DD).' }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return { ok: false, error: 'Date of birth must be YYYY-MM-DD.' }
  return { ok: true, value: s }
}

/** Primary contact field in DB is `contact_no`; accept legacy / camel names in JSON. */
function normStr(v) {
  if (v == null) return ''
  return String(v).trim()
}

function readStudentContact(b) {
  const a =
    readStudentField(b, 'phoneNumber', 'phone_number') ||
    readStudentField(b, 'contactNumber', 'contact_no') ||
    readStudentField(b, 'contactNo', 'contact_no')
  if (a) return a
  return readStudentField(b, 'contactNumber', 'contact_number')
}

function readStudentParentContact(b) {
  return (
    readStudentField(b, 'parentPhone', 'parent_phone') ||
    readStudentField(b, 'parentContact', 'parent_contact')
  )
}

function readStudentAppPassword(b) {
  return (
    readStudentField(b, 'appPasswordGmail', 'app_password_gmail') ||
    readStudentField(b, 'appPassword', 'app_password')
  )
}

/** Primary photo field in DB is `photo_url` (stored file path or legacy data URL); accept legacy keys. */
function readStudentPhotoUrl(b) {
  const a =
    readStudentOptional(b, 'studentPhotoUrl', 'photo_url') ||
    readStudentOptional(b, 'photoDataUrl', 'photo_url')
  if (a) return a
  return readStudentOptional(b, 'studentPhotoUrl', 'student_photo_url')
}

const FACULTY_SECRET_KEYS = [
  'password_hash',
  'password',
  'raw_password_placeholder',
  'app_password_gmail',
  'app_password',
  'appPassword',
  'appPasswordGmail',
]

function omitFacultySecrets(row) {
  if (!row || typeof row !== 'object') return row
  const out = { ...row }
  for (const key of FACULTY_SECRET_KEYS) delete out[key]
  return out
}

function sectionGradeLabel(s) {
  return String(s?.grade_level ?? s?.grade ?? '').trim()
}

function collectFacultyGradeLevels(row, advisorySections) {
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
let facultiesColumnSetCache = null

async function getFacultiesColumnSet(pool) {
  if (facultiesColumnSetCache) return facultiesColumnSetCache
  const { rows } = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'faculties'
  `)
  facultiesColumnSetCache = new Set((rows || []).map((r) => String(r.column_name)))
  return facultiesColumnSetCache
}

function buildFacultyDisplayName(first_name, middle_name, last_name, fallback = '') {
  const composed = [first_name, middle_name, last_name].filter(Boolean).join(' ').trim()
  return composed || String(fallback || '').trim() || 'Faculty'
}

function parseAdvisorySectionsFromFacultiesRow(row) {
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

async function buildAdvisorySectionsJson(pool, sectionIds, advisorySections) {
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
async function ensureFacultiesExtendedColumns(pool) {
  const additions = [
    ['password_hash', 'TEXT NULL'],
    ['photo_url', 'TEXT NULL'],
    ['grade_level', 'VARCHAR(64) NULL'],
    ['app_password_gmail', 'TEXT NULL'],
    ['employee_id', 'VARCHAR(128) NULL'],
    ['specialization', 'VARCHAR(255) NULL'],
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
async function migrateFacultiesLegacyColumns(pool) {
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
async function applyFacultyPasswordFields(row, colSet, b, { isUpdate = false } = {}) {
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
async function mapBodyToFacultiesRow(pool, b, { sectionIds = [], includeSecrets = true, isUpdate = false } = {}) {
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

function sqlSetClause(keys, startAt = 1) {
  const parts = []
  let n = startAt
  for (const key of keys) {
    parts.push(`${key} = $${n++}`)
  }
  return { text: parts.join(', '), nextIndex: n }
}

async function insertFacultiesRow(client, row, colSet) {
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
const FACULTY_UPDATE_PROTECTED_KEYS = new Set(['id', 'auth_user_id'])

async function updateFacultiesRow(client, id, row, colSet) {
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
async function updateFacultyWithSections(client, facultyId, row, colSet, sectionIds) {
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

const MAX_FACULTY_PHOTO_URL_CHARS = 2_000_000

function readFacultyPhotoUrl(b) {
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

async function safePgRollback(client) {
  if (!client) return
  try {
    await client.query('ROLLBACK')
  } catch (e) {
    logStatePostgresError('ROLLBACK', e)
  }
}

/** Fail fast before junction insert when section_ids are invalid. */
async function assertSectionIdsExist(client, sectionIds) {
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
function parseFacultySectionIds(b) {
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

function parseFacultySectionsJson(row) {
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

function facultyRowToResponse(row) {
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

async function replaceFacultySections(client, facultyId, sectionIds) {
  const fid = String(facultyId || '').trim()
  if (!fid) return
  await client.query('DELETE FROM faculty_sections WHERE faculty_id = $1', [fid])
  if (!sectionIds.length) return
  await assertSectionIdsExist(client, sectionIds)
  const { text: ph } = pgValuePlaceholders(sectionIds.length, 2, 1)
  const values = sectionIds.flatMap((sid) => [fid, sid])
  await client.query(`INSERT INTO faculty_sections (faculty_id, section_id) VALUES ${ph}`, values)
}

/** List all columns present on `public.faculties` (works with minimal pgAdmin schemas). */
const FACULTIES_FROM = 'FROM public.faculties'

/** Server-side diagnostics: always prefix Postgres failures for grep-friendly logs. */
function logStatePostgresError(context, err) {
  const msg = err?.message || err
  const code = err?.code || err?.errno || ''
  console.error(`[state] PostgreSQL Error (${context}):`, msg, code ? `[${code}]` : '')
}

/**
 * One curriculum row from `app_state` JSON — tolerate snake_case, missing keys,
 * and the literal strings "null" / "undefined" (common after bad merges or exports).
 */
function normalizeCurriculumFromState(raw, index) {
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
function curriculumFileDisplayName(c) {
  const fn = String(c?.fileName ?? '').trim()
  if (fn) return fn
  const sub = String(c?.subject ?? '').trim()
  if (sub) return sub
  return ''
}

/** @param {number} rowCount @param {number} colCount @param {number} [startAt] */
function pgValuePlaceholders(rowCount, colCount, startAt = 1) {
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

async function ensureSchema(pool) {
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
      quarter TEXT,
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

  await ensureAnnouncementsTable(pool)

  await ensureArchivedAtColumns(pool)

  await ensureTeacherDashboardAggregateTables(pool)
}

/** Rows for faculty-scoped LMS stats (assignments counts). */
async function ensureTeacherDashboardAggregateTables(pool) {
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
async function ensureArchivedAtColumns(pool) {
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

async function requireAdminSession(req, res, auth) {
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
    return session
  } catch (e) {
    sendSafeServerError(res, e, 'requireAdminSession')
    return null
  }
}

function parseArchiveEntityType(raw) {
  const type = String(raw || '')
    .trim()
    .toLowerCase()
  if (!ARCHIVE_ENTITY_TYPES.has(type)) return null
  return type
}

async function archiveStudentRecord(pool, id) {
  const r = await pool.query(
    'UPDATE students SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL',
    [id],
  )
  return Number(r?.rowCount ?? 0) > 0
}

async function archiveFacultyRecord(pool, id) {
  const r = await pool.query(
    `UPDATE public.faculties SET archived_at = NOW() WHERE id = $1 AND archived_at IS NULL`,
    [id],
  )
  return Number(r?.rowCount ?? 0) > 0
}

const VAULT_OBFUSCATED_LABEL = 'HIDDEN/ARCHIVED'

function buildVaultStudentDisplayName(row) {
  const first = String(row.first_name || '').trim()
  const middle = String(row.middle_name || '').trim()
  const last = String(row.last_name || '').trim()
  return [first, middle, last].filter(Boolean).join(' ').trim() || VAULT_OBFUSCATED_LABEL
}

/** Archive Vault API: expose only display name + id + archived_at; mask all other identifiers. */
function obfuscateArchivedStudentForVault(row) {
  const archived_at = row.archived_at
  return {
    id: row.id,
    name: buildVaultStudentDisplayName(row),
    first_name: String(row.first_name || '').trim(),
    middle_name: String(row.middle_name || '').trim(),
    last_name: String(row.last_name || '').trim(),
    archived_at,
    archivedAt: archived_at,
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

function obfuscateArchivedFacultyForVault(row) {
  const first_name = String(row.first_name || '').trim()
  const middle_name = String(row.middle_name || '').trim()
  const last_name = String(row.last_name || '').trim()
  const name =
    String(row.name || '').trim() ||
    buildFacultyDisplayName(first_name, middle_name, last_name, '') ||
    VAULT_OBFUSCATED_LABEL
  const archived_at = row.archived_at
  return {
    id: String(row.id),
    name,
    first_name,
    middle_name,
    last_name,
    archived_at,
    archivedAt: archived_at,
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

const ANNOUNCEMENT_TYPES = new Set(['Institute', 'Campus', 'Announcement', 'Event', 'News'])

function announcementPgError(res, e) {
  sendSafeServerError(res, e, 'announcements')
}

async function ensureAnnouncementsTable(pool) {
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

const MAX_SUBJECT_SYLLABUS_CHARS = 8_000_000

function normalizeSubjectTextField(raw, maxChars, label) {
  if (raw == null || raw === '') return null
  const s = String(raw)
  if (s.length > maxChars) {
    console.warn(`[state] subject ${label} truncated (${s.length} chars > ${maxChars})`)
    return s.slice(0, maxChars)
  }
  return s
}

function readSubjectSyllabus(b) {
  const raw =
    b?.syllabusDataUrl ?? b?.syllabus_data_url ?? b?.syllabus_pdf ?? b?.syllabusPdf ?? ''
  return normalizeSubjectTextField(raw, MAX_SUBJECT_SYLLABUS_CHARS, 'syllabus_pdf')
}

function readSubjectBodyFields(b) {
  const subject_code = readStudentField(b, 'subjectCode', 'subject_code')
  const subject_name = readStudentField(b, 'subjectName', 'subject_name')
  const grade_level =
    readStudentField(b, 'gradeLevel', 'grade_level') || readStudentField(b, 'grade', 'grade')
  const quarter = normalizeSubjectQuarter(b?.quarter)
  const faculty_id =
    readStudentField(b, 'assignedFacultyId', 'assigned_faculty_id') ||
    readStudentField(b, 'facultyId', 'faculty_id')
  const syllabus_pdf = readSubjectSyllabus(b)
  return { subject_code, subject_name, grade_level, quarter, faculty_id, syllabus_pdf }
}

function subjectPgError(res, e) {
  sendSafeServerError(res, e, 'subjects')
}

function normalizeSubjectQuarter(raw) {
  const q = String(raw ?? '').trim()
  if (!q) return ''
  const n = Number(q)
  if (Number.isFinite(n) && n >= 1 && n <= 4) return String(n)
  return q.slice(0, 16)
}

function subjectRowToResponse(row) {
  if (!row) return null
  const quarterRaw = row.quarter
  const quarterNum = Number(quarterRaw)
  const quarter =
    Number.isFinite(quarterNum) && quarterRaw != null && String(quarterRaw).trim() !== ''
      ? quarterNum
      : quarterRaw
  const storedPhoto = String(row.subject_photo ?? '').trim()
  const subjectPhoto =
    storedPhoto || resolveSubjectImagePath(String(row.subject_name ?? '').trim())
  return {
    id: row.id != null ? Number(row.id) : row.id,
    subjectCode: row.subject_code,
    subjectName: row.subject_name,
    grade: row.grade_level,
    grade_level: row.grade_level,
    quarter,
    assignedFacultyId: row.faculty_id ?? '',
    faculty_id: row.faculty_id ?? '',
    assignedFacultyName: String(row.faculty_name ?? '').trim(),
    syllabusDataUrl: row.syllabus_pdf ?? '',
    syllabus_pdf: row.syllabus_pdf ?? '',
    subjectPhoto,
    subject_photo: subjectPhoto,
    cover_image_url: subjectPhoto,
    faculty_name: String(row.faculty_name ?? '').trim(),
    createdAt: row.created_at,
    created_at: row.created_at,
  }
}

async function ensureSubjectsTable(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subjects (
      id SERIAL PRIMARY KEY,
      subject_photo TEXT,
      subject_code VARCHAR(50) UNIQUE NOT NULL,
      subject_name VARCHAR(255) NOT NULL,
      grade_level VARCHAR(64) NOT NULL,
      quarter VARCHAR(16) NOT NULL,
      faculty_id VARCHAR(64) REFERENCES faculties(id) ON DELETE SET NULL,
      syllabus_pdf TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_grade_level ON subjects (grade_level)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_quarter ON subjects (quarter)`)
  await pool.query(`CREATE INDEX IF NOT EXISTS idx_subjects_faculty_id ON subjects (faculty_id)`)
}

/** Advisory section junction for canonical `public.faculties` roster rows. */
async function ensureFacultyCatalogTables(pool) {
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
async function ensureStudentsCatalogColumns(pool) {
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
  } catch (e) {
    logStatePostgresError('ensureStudentsCatalogColumns', e)
  }
}

/** Widen legacy TEXT columns on `sections` if present; does not force NOT NULL (matches catalog DDL). */
async function ensureSectionsCatalogColumns(pool) {
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
async function ensureCurriculumManifestColumns(pool) {
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

async function purgeFacultyFromAppStateJson(client, facultyId) {
  const id = String(facultyId || '').trim()
  if (!id) return
  try {
    const { rows } = await client.query('SELECT json FROM app_state WHERE id = $1 LIMIT 1', [STATE_ID])
    const raw = rows?.[0]?.json
    if (!raw) return
    let parsed
    try {
      parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch {
      return
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.faculties)) return
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

async function syncFaculties(client, state) {
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

async function syncSections(client, state) {
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

async function syncCurriculums(client, state) {
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
async function syncCurriculumManifest(client, state) {
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

async function backfillMirrorTables(pool) {
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

async function noopClose() {}

/**
 * @returns {{ router: import('express').Router, close: () => Promise<void> }}
 */
export async function createStateApiRouter(express, { auth } = {}) {
  const router = express.Router()

  if (!isPgConfigured()) {
    const notConfiguredDetail =
      'PostgreSQL is not configured. Set DATABASE_URL in .env (e.g. postgres://user:pass@localhost:5432/lenlearn_db), run `npx auth@latest migrate --yes --config server/auth.js`, then restart the server.'
    router.get('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message:
          'Institute records are not set up on this server yet. Your sign-in still works; the dashboard may use saved or profile data.',
        detail: notConfiguredDetail,
      })
    })
    router.put('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message:
          'Institute records are not set up on this server yet. Your sign-in still works; the dashboard may use saved or profile data.',
        detail: notConfiguredDetail,
      })
    })
    const curriculum503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Curriculum API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/curriculum', curriculum503)
    router.post('/v1/curriculum', curriculum503)
    router.put('/v1/curriculum/:id', curriculum503)
    router.delete('/v1/curriculum/:id', curriculum503)
    const sections503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Sections API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/sections', sections503)
    router.post('/v1/sections', sections503)
    router.delete('/v1/sections/:id', sections503)
    const subjects503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Subjects API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/subjects', subjects503)
    router.post('/v1/subjects', subjects503)
    router.put('/v1/subjects/:id', subjects503)
    router.delete('/v1/subjects/:id', subjects503)
    const announcements503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Announcements API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/announcements', announcements503)
    router.post('/v1/announcements', announcements503)
    router.put('/v1/announcements/:id', announcements503)
    router.delete('/v1/announcements/:id', announcements503)
    const students503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Students API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/students', students503)
    router.post('/v1/students', students503)
    router.put('/v1/students/:id', students503)
    router.delete('/v1/students/:id', students503)
    const faculty503 = (_req, res) => {
      res.status(503).json({
        error: 'DATABASE_NOT_CONFIGURED',
        message: 'Faculty API requires PostgreSQL.',
        detail: notConfiguredDetail,
      })
    }
    router.get('/v1/faculty', faculty503)
    router.post('/v1/faculty', faculty503)
    router.put('/v1/faculty/:id', faculty503)
    router.delete('/v1/faculty/:id', faculty503)
    return { router, close: noopClose }
  }

  let pool
  try {
    pool = getPgPool()
    if (!pool) throw new Error('PostgreSQL pool unavailable')
    await ensureSchema(pool)
    await ensureRecordIntegrityColumns(pool)
    facultiesColumnSetCache = null
    await getFacultiesColumnSet(pool)
    await backfillMirrorTables(pool)
  } catch (e) {
    logStatePostgresError('createStateApiRouter startup', e)
    const raw = String(e?.message || e)
    const code = e?.code
    const transientPg =
      code === 'ECONNREFUSED' || code === 'ECONNRESET' || code === 'ETIMEDOUT' || code === 'ENOTFOUND'
    const devHint = transientPg
      ? ' Start PostgreSQL, fix DATABASE_URL/host/port, or verify the database exists.'
      : ''
    const detail = raw + devHint
    const userMessage = transientPg
      ? 'The database server is not running or not reachable. Your sign-in still works; the dashboard may use saved or profile data.'
      : 'The database could not be reached. Your sign-in still works; the dashboard may use saved or profile data.'
    router.get('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: userMessage,
        detail,
      })
    })
    router.put('/v1/state', (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: userMessage,
        detail,
      })
    })
    const curriculum503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Curriculum API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/curriculum', curriculum503b)
    router.post('/v1/curriculum', curriculum503b)
    router.put('/v1/curriculum/:id', curriculum503b)
    router.delete('/v1/curriculum/:id', curriculum503b)
    const sections503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Sections API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/sections', sections503b)
    router.post('/v1/sections', sections503b)
    router.delete('/v1/sections/:id', sections503b)
    const subjects503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Subjects API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/subjects', subjects503b)
    router.post('/v1/subjects', subjects503b)
    router.put('/v1/subjects/:id', subjects503b)
    router.delete('/v1/subjects/:id', subjects503b)
    const announcements503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Announcements API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/announcements', announcements503b)
    router.post('/v1/announcements', announcements503b)
    router.put('/v1/announcements/:id', announcements503b)
    router.delete('/v1/announcements/:id', announcements503b)
    const students503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Students API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/students', students503b)
    router.post('/v1/students', students503b)
    router.put('/v1/students/:id', students503b)
    router.delete('/v1/students/:id', students503b)
    const faculty503b = (_req, res) => {
      res.status(503).json({
        error: 'POSTGRES_UNAVAILABLE',
        message: 'Faculty API requires a running PostgreSQL server.',
        detail,
      })
    }
    router.get('/v1/faculty', faculty503b)
    router.post('/v1/faculty', faculty503b)
    router.put('/v1/faculty/:id', faculty503b)
    router.delete('/v1/faculty/:id', faculty503b)
    return { router, close: noopClose }
  }

  router.get('/v1/state', async (_req, res) => {
    try {
      const { rows } = await pool.query('SELECT json FROM app_state WHERE id = $1', [STATE_ID])
      const row = rows?.[0]
      if (!row?.json) {
        res.json({ ok: true, state: null })
        return
      }
      try {
        res.json({ ok: true, state: JSON.parse(row.json) })
      } catch {
        res.status(500).json({ error: 'STATE_CORRUPT', message: 'Saved state could not be parsed.' })
      }
    } catch (e) {
      logStatePostgresError('GET /v1/state', e)
      sendSafeServerError(res, e, 'GET /v1/state')
    }
  })

  router.put('/v1/state', async (req, res) => {
    try {
      const state = req.body?.state
      if (state === undefined) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Expected JSON body: { state: ... }' })
        return
      }

      const json = JSON.stringify(state)
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        await client.query(
          `
            INSERT INTO app_state (id, json, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = NOW()
          `,
          [STATE_ID, json],
        )
        // Mirror app_state.faculties only when the client explicitly sends that array (local mode).
        // Never wipe the canonical PostgreSQL faculty roster — upsert active rows only.
        if (Array.isArray(state?.faculties) && state?.__localFacultyMirror === true) {
          await syncFaculties(client, state)
        }
        await syncSections(client, state)
        await syncCurriculums(client, state)
        await syncCurriculumManifest(client, state)
        await client.query('COMMIT')
      } catch (e) {
        await client.query('ROLLBACK')
        throw e
      } finally {
        client.release()
      }
      res.json({ ok: true })
    } catch (e) {
      logStatePostgresError('PUT /v1/state', e)
      res.status(500).json({
        error: 'STATE_SAVE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

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
        'INSERT INTO curriculum (title, description, grade_level, file_name, source_id) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [title, description, grade_level, file_name, source_id],
      )
      const insertId = Number(rows[0]?.id ?? 0)
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
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid curriculum id.' })
        return
      }
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
        'UPDATE curriculum SET title = $1, description = $2, grade_level = $3, file_name = $4, source_id = $5 WHERE id = $6',
        [title, description, grade_level, file_name, source_id, id],
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
        return
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
      const raw = String(req.params.id || '').trim()
      if (!raw) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Missing curriculum id.' })
        return
      }
      let r
      if (/^\d+$/.test(raw)) {
        const id = Number(raw)
        console.log(`Deleting ID ${id} from curriculum in PostgreSQL`)
        r = await pool.query('DELETE FROM curriculum WHERE id = $1', [id])
      } else {
        console.log(`Deleting ID ${raw} from curriculum in PostgreSQL`)
        r = await pool.query('DELETE FROM curriculum WHERE source_id = $1', [raw])
      }
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Curriculum row not found.' })
        return
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
        description: `Section created: ${section_name}`,
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

  router.delete('/v1/sections/:id', async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid sections id.' })
        return
      }
      console.log(`Deleting ID ${id} from sections in PostgreSQL`)
      const r = await pool.query('DELETE FROM sections WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Section row not found.' })
        return
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

  router.get('/v1/subjects', async (req, res) => {
    try {
      const grade_level = String(req.query.grade_level || req.query.grade || '').trim()
      const quarter = String(req.query.quarter ?? '').trim()
      const clauses = []
      const params = []
      if (grade_level) {
        params.push(grade_level)
        clauses.push(`s.grade_level = $${params.length}`)
      }
      if (quarter) {
        params.push(normalizeSubjectQuarter(quarter))
        clauses.push(`s.quarter = $${params.length}`)
      }
      let sql = `
        SELECT
          s.id,
          s.subject_code,
          s.subject_name,
          s.grade_level,
          s.quarter,
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
      `
      if (clauses.length) sql += ` WHERE ${clauses.join(' AND ')}`
      sql += ' ORDER BY s.id DESC'
      const { rows } = await pool.query(sql, params)
      res.json({ ok: true, subjects: rows.map((r) => subjectRowToResponse(r)) })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.post('/v1/subjects', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const b = req.body || {}
      const { subject_code, subject_name, grade_level, quarter, faculty_id, syllabus_pdf } =
        readSubjectBodyFields(b)

      if (!subject_code || !subject_name || !grade_level || !quarter) {
        res.status(400).json({
          error: 'Required: subjectCode, subjectName, grade (or gradeLevel), and quarter.',
        })
        return
      }

      const facultyIdParam = faculty_id || null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const { rows } = await pool.query(
        `
          INSERT INTO subjects (
            subject_code, subject_name, grade_level, quarter, faculty_id, syllabus_pdf, subject_photo
          ) VALUES ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id, subject_code, subject_name, grade_level, quarter,
            faculty_id, syllabus_pdf, subject_photo, created_at
        `,
        [subject_code, subject_name, grade_level, quarter, facultyIdParam, syllabus_pdf, subject_photo],
      )
      const row = rows?.[0]
      await auditInstituteRecord(adminSession, 'SUBJECT_CREATED', {
        recordType: 'subject',
        recordId: String(row?.id ?? ''),
        description: `Subject created: ${subject_name}`,
      })
      res.status(201).json({
        ok: true,
        subject: subjectRowToResponse(row),
        id: row?.id != null ? Number(row.id) : null,
      })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.put('/v1/subjects/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid subject id.' })
        return
      }
      const b = req.body || {}
      const { subject_code, subject_name, grade_level, quarter, faculty_id, syllabus_pdf } =
        readSubjectBodyFields(b)

      if (!subject_code || !subject_name || !grade_level || !quarter) {
        res.status(400).json({
          error: 'Required: subjectCode, subjectName, grade (or gradeLevel), and quarter.',
        })
        return
      }

      const facultyIdParam = faculty_id || null
      const subject_photo = resolveSubjectImagePath(subject_name)
      const { rows } = await pool.query(
        `
          UPDATE subjects
          SET subject_code = $1, subject_name = $2, grade_level = $3, quarter = $4,
            faculty_id = $5, syllabus_pdf = $6, subject_photo = $7
          WHERE id = $8
          RETURNING id, subject_code, subject_name, grade_level, quarter,
            faculty_id, syllabus_pdf, subject_photo, created_at
        `,
        [subject_code, subject_name, grade_level, quarter, facultyIdParam, syllabus_pdf, subject_photo, id],
      )
      if (!rows?.length) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      await auditInstituteRecord(adminSession, 'SUBJECT_UPDATED', {
        recordType: 'subject',
        recordId: String(id),
        description: `Subject updated: ${subject_name}`,
      })
      res.json({ ok: true, subject: subjectRowToResponse(rows[0]) })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.delete('/v1/subjects/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid subject id.' })
        return
      }
      console.log(`Deleting ID ${id} from subjects in PostgreSQL`)
      const r = await pool.query('DELETE FROM subjects WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Subject not found.' })
        return
      }
      await auditInstituteRecord(adminSession, 'SUBJECT_DELETED', {
        recordType: 'subject',
        recordId: String(id),
        description: `Subject deleted: ${id}`,
      })
      res.json({ ok: true, id })
    } catch (e) {
      subjectPgError(res, e)
    }
  })

  router.get('/v1/announcements', async (_req, res) => {
    try {
      const { rows } = await pool.query(`
        SELECT id, announcement_image, image_path, image_name, uploaded_by,
               title, type, message, created_at, updated_at
        FROM announcements
        ORDER BY created_at DESC
      `)
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

      const imageFields = resolveAnnouncementImageForSave({
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
      await auditInstituteRecord(adminSession, 'ANNOUNCEMENT_CREATED', {
        recordType: 'announcement',
        recordId: String(row?.id ?? ''),
        description: `Announcement created: ${title}`,
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

      const imageFields = resolveAnnouncementImageForSave({
        announcement_image,
        image_name,
        title,
        existingPath: existing.image_path,
        existingDataUrl: existing.announcement_image,
      })
      maybeDeleteOldAnnouncementFile(imageFields.deleteOldPath, imageFields.image_path)

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
      res.json({ ok: true, announcement: announcementRowToResponse(rows[0]) })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

  router.delete('/v1/announcements/:id', async (req, res) => {
    try {
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid announcement id.' })
        return
      }
      console.log(`Deleting ID ${id} from announcements in PostgreSQL`)
      const r = await pool.query('DELETE FROM announcements WHERE id = $1', [id])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'Announcement not found.' })
        return
      }
      res.json({ ok: true, id })
    } catch (e) {
      announcementPgError(res, e)
    }
  })

  const listActiveFaculty = async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    try {
      const colSet = await getFacultiesColumnSet(pool)
      const listSql = colSet.has('updated_at')
        ? `SELECT * ${FACULTIES_FROM} WHERE archived_at IS NULL ORDER BY updated_at DESC NULLS LAST, id DESC`
        : `SELECT * ${FACULTIES_FROM} WHERE archived_at IS NULL ORDER BY id DESC`
      const { rows } = await pool.query(listSql)
      res.json({ ok: true, faculty: rows.map((r) => facultyRowToResponse(r)) })
    } catch (e) {
      logStatePostgresError('GET /v1/faculty', e)
      sendSafeServerError(res, e, 'GET /v1/faculty')
    }
  }

  router.get('/v1/faculty', listActiveFaculty)
  router.get('/v1/faculties', listActiveFaculty)

  router.get('/v1/faculty/:id', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    try {
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }
      const { rows } = await pool.query(
        `SELECT * ${FACULTIES_FROM} WHERE id = $1 AND archived_at IS NULL`,
        [id],
      )
      if (!rows?.length) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }
      res.json({ ok: true, faculty: facultyRowToResponse(rows[0]) })
    } catch (e) {
      logStatePostgresError('GET /v1/faculty/:id', e)
      res.status(500).json({
        success: false,
        error: GENERIC_SERVER_ERROR,
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/faculty', facultyPhotoUploadMiddleware, async (req, res) => {
    const b = normalizeFacultyMultipartBody(req.body || {})
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const facultyCode =
        readStudentField(b, 'facultyCodeId', 'faculty_code_id') ||
        readStudentField(b, 'facultyUsername', 'faculty_username') ||
        readStudentField(b, 'facultyCode', 'faculty_code') ||
        '(none)'
      console.log(
        `[faculty] POST /v1/faculty - Processing registration for code: ${facultyCode}`,
      )
      const sectionIds = parseFacultySectionIds(b)

      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email').toLowerCase()
      const auth_user_id = readStudentField(b, 'authUserId', 'auth_user_id')

      if (!first_name || !last_name || !email) {
        res.status(400).json({
          success: false,
          error: 'Required: firstName, lastName, and email.',
        })
        return
      }
      if (!auth_user_id) {
        res.status(400).json({
          success: false,
          error:
            'auth_user_id is required. Create or link the Better Auth account first, then save faculty.',
        })
        return
      }
      if (sectionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one advisory section (sectionIds) is required.',
        })
        return
      }

      const password = readStudentField(b, 'password', 'password')
      if (!password) {
        res.status(400).json({
          success: false,
          error: 'Password is required when creating a faculty member.',
        })
        return
      }

      const draftFacultyId = readStudentField(b, 'id', 'id') || randomUUID()
      try {
        await resolveFacultyPhotoForDb({
          file: getFacultyUploadFile(req),
          body: b,
          facultyId: draftFacultyId,
          isUpdate: false,
        })
      } catch (photoErr) {
        res.status(400).json({ success: false, error: String(photoErr?.message || photoErr) })
        return
      }

      const { row, colSet } = await mapBodyToFacultiesRow(pool, b, {
        sectionIds,
        includeSecrets: true,
        isUpdate: false,
      })
      row.id = draftFacultyId
      row.auth_user_id = auth_user_id
      row.name = buildFacultyDisplayName(
        first_name,
        readStudentOptional(b, 'middleName', 'middle_name'),
        last_name,
        readStudentField(b, 'name', 'name'),
      )

      const client = await pool.connect()
      let inserted
      try {
        inserted = await insertFacultiesRow(client, row, colSet)
      } finally {
        client.release()
      }
      if (!inserted?.id) {
        throw new Error('Faculty insert did not return a row.')
      }
      console.log(`[faculty] POST /v1/faculty - saved id=${inserted.id}`)

      await auditInstituteRecord(adminSession, 'FACULTY_CREATED', {
        recordType: 'faculty',
        recordId: String(inserted.id),
        description: `Faculty created: ${buildFacultyDisplayName(first_name, readStudentOptional(b, 'middleName', 'middle_name'), last_name, '')}`,
      })

      res.status(201).json({
        success: true,
        message: 'Faculty saved',
        ok: true,
        id: String(inserted.id),
        faculty: facultyRowToResponse(inserted),
      })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'A faculty member with this email or faculty code already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          success: false,
          error: 'One or more section_ids do not exist.',
        })
        return
      }
      logStatePostgresError('POST /v1/faculty', e)
      sendSafeServerError(res, e, 'POST /v1/faculty')
    }
  })

  router.put('/v1/faculty/:id', facultyPhotoUploadMiddleware, async (req, res) => {
    const b = normalizeFacultyMultipartBody(req.body || {})
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }

      const priorState = await fetchFacultyPriorState(pool, id)
      if (!priorState?.row) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }
      const oldData = priorState.row
      const oldSectionIds = priorState.sectionIds
      const priorPhotoUrl = String(oldData.photo_url || oldData.photo_data_url || '').trim()

      let photoResolve = { photoSent: false, photoUrl: null }
      try {
        photoResolve = await resolveFacultyPhotoForDb({
          file: getFacultyUploadFile(req),
          body: b,
          facultyId: id,
          isUpdate: true,
          priorPhotoUrl,
        })
      } catch (photoErr) {
        const code = photoErr?.statusCode === 400 ? 400 : 400
        res.status(code).json({ success: false, error: String(photoErr?.message || photoErr) })
        return
      }

      const sectionIds = parseFacultySectionIds(b)
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email').toLowerCase()

      if (!first_name || !last_name || !email) {
        res.status(400).json({
          success: false,
          error: 'Update requires firstName, lastName, and email.',
        })
        return
      }
      if (sectionIds.length === 0) {
        res.status(400).json({
          success: false,
          error: 'At least one advisory section (sectionIds) is required.',
        })
        return
      }

      const { row, colSet } = await mapBodyToFacultiesRow(pool, b, {
        sectionIds,
        includeSecrets: true,
        isUpdate: true,
      })
      row.name = buildFacultyDisplayName(
        first_name,
        readStudentOptional(b, 'middleName', 'middle_name'),
        last_name,
        readStudentField(b, 'name', 'name'),
      )
      await stampRowLastModified(
        pool,
        'faculties',
        row,
        String(adminSession.user?.id || adminSession.data?.user?.id || ''),
      )
      const client = await pool.connect()
      let updated
      try {
        updated = await updateFacultyWithSections(client, id, row, colSet, sectionIds)
      } catch (e) {
        console.error('[PUT /v1/faculty/:id]', e)
        logStatePostgresError('PUT /v1/faculty/:id update', e)
        throw e
      } finally {
        client.release()
      }

      if (!updated) {
        res.status(404).json({ success: false, error: 'Faculty not found.' })
        return
      }

      await auditInstituteRecord(adminSession, 'FACULTY_UPDATED', {
        recordType: 'faculty',
        recordId: id,
        description: `Faculty updated: ${buildFacultyAuditTargetName(updated)}`,
      })

      try {
        const newCompare = buildFacultyComparePayload(b, sectionIds)
        const photoUploaded = Boolean(getFacultyUploadFile(req))
        const photoFlag =
          b?.photoChanged === true || String(b?.photoChanged || '').toLowerCase() === 'true'
        const oldPhoto = normStr(oldData.photo_url ?? oldData.photo_data_url)
        const newPhoto = normStr(photoResolve.photoUrl ?? newCompare.photoUrl)
        const photoChanged =
          photoUploaded ||
          photoFlag ||
          (photoResolve.photoSent && newPhoto !== '' && newPhoto !== oldPhoto)
        const passwordChanged = Boolean(readStudentField(b, 'password', 'password'))
        const appPwRaw =
          readStudentField(b, 'appPasswordGmail', 'app_password_gmail') ||
          readStudentField(b, 'appPassword', 'app_password')
        const appPasswordInBody = Boolean(appPwRaw)

        const detailedDiffs = await computeFacultyProfileDetailedDiffs(oldData, newCompare, {
          pool,
          oldSectionIds,
          newSectionIds: sectionIds,
          passwordChanged,
          appPasswordInBody,
          photoChanged,
        })
        const updatedFieldKeys = Object.keys(detailedDiffs)

        if (updatedFieldKeys.length > 0) {
          const actor = adminSession.user || adminSession.data?.user || {}
          const actorId = String(actor.id || '').trim()
          const targetEmail = normStr(updated.email ?? newCompare.email).toLowerCase()
          const authUserId =
            String(updated.auth_user_id || oldData.auth_user_id || '').trim() ||
            (await findAuthUserIdByEmail(targetEmail)) ||
            `faculty-record:${id}`

          await customActivityLogger.logUserAccountChanged(authUserId, {
            actorUserId: actorId,
            actorName: String(actor.name || '').trim(),
            actorEmail: String(actor.email || '').trim(),
            actorRole: 'admin',
            triggerContext: 'admin',
            userName: buildFacultyAuditTargetName(updated),
            userEmail: targetEmail,
            targetRole: 'faculty',
            updatedFields: updatedFieldKeys,
            detailedDiffs,
            source: 'admin',
          })
          console.log(
            '[Diagnostic] Audit Log for user_account_changed recorded successfully!',
            { facultyId: id, fields: updatedFieldKeys },
          )
        } else {
          console.log('[Diagnostic] No faculty field changes detected — audit log skipped.')
        }
      } catch (logErr) {
        console.warn('[Diagnostic] faculty user_account_changed audit failed:', logErr?.message || logErr)
      }

      console.log('[Diagnostic] Sending 200 response to client')
      res.json({ ok: true, success: true, faculty: facultyRowToResponse(updated) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          success: false,
          error: 'A faculty member with this email or faculty code already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          success: false,
          error: 'One or more section_ids do not exist.',
        })
        return
      }
      console.error('[PUT /v1/faculty/:id]', e)
      logStatePostgresError('PUT /v1/faculty/:id', e)
      sendSafeServerError(res, e, 'PUT /v1/faculty/:id')
    }
  })

  async function handleArchiveFaculty(req, res) {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      if (req.method === 'DELETE' && !requireDestructiveConfirm(req, res, 'DELETE')) return
      const id = String(req.params.id || '').trim()
      if (!id) {
        res.status(400).json({ success: false, error: 'Invalid faculty id.' })
        return
      }
      const archived = await archiveFacultyRecord(pool, id)
      if (!archived) {
        res.status(404).json({ success: false, message: 'Faculty not found or already archived.' })
        return
      }
      await purgeFacultyFromAppStateJson(pool, id)
      await auditInstituteRecord(adminSession, 'FACULTY_DELETED', {
        recordType: 'faculty',
        recordId: id,
        description: `Faculty archived: ${id}`,
      })
      res.json({ ok: true, success: true, id, archived: true })
    } catch (e) {
      logStatePostgresError('archive faculty', e)
      sendSafeServerError(res, e, 'faculty route')
    }
  }

  router.post('/v1/faculties/:id/archive', handleArchiveFaculty)
  router.post('/v1/faculty/:id/archive', handleArchiveFaculty)

  router.delete('/v1/faculty/:id', handleArchiveFaculty)

  router.get('/v1/students', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    try {
      const { rows } = await pool.query(`
        SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name,
          s.email, s.contact_no, s.address, s.dob, s.parent_contact, s.parent_email,
          s.enrollment_no, s.roll_no, s.grade_level, s.quarter, s.section_id,
          s.login_id, s.app_password_gmail, s.created_at,
          sec.section_name AS section_name
        FROM students s
        LEFT JOIN sections sec ON sec.id = s.section_id
        WHERE s.archived_at IS NULL
        ORDER BY s.id DESC
      `)
      res.json({ ok: true, students: rows.map((r) => omitStudentPassword(r)) })
    } catch (e) {
      logStatePostgresError('GET /v1/students', e)
      res.status(500).json({
        error: 'STUDENTS_LIST_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.post('/v1/students', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      const b = req.body || {}
      const dobParsed = parseStudentDob(b)
      if (!dobParsed.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: dobParsed.error })
        return
      }
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email')
      const contact_no = readStudentContact(b)
      const address = readStudentField(b, 'address', 'address')
      const parent_contact = readStudentParentContact(b)
      const parent_email = readStudentField(b, 'parentEmail', 'parent_email')
      const enrollment_no = readStudentField(b, 'enrollmentNo', 'enrollment_no')
      const roll_no = readStudentField(b, 'rollNo', 'roll_no')
      const grade_level = readStudentField(b, 'gradeLevel', 'grade_level')
      const quarter = readStudentField(b, 'quarter', 'quarter')
      const login_id = readStudentField(b, 'loginId', 'login_id')
      const password = readStudentField(b, 'password', 'password')
      if (
        !first_name ||
        !last_name ||
        !email ||
        !contact_no ||
        !address ||
        !parent_contact ||
        !parent_email ||
        !enrollment_no ||
        !roll_no ||
        !grade_level ||
        !quarter ||
        !login_id ||
        !password
      ) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message:
            'Required: firstName, lastName, email, contactNumber (or contactNo), address, dob, parentContact, parentEmail, enrollmentNo, rollNo, gradeLevel, quarter, loginId, password.',
        })
        return
      }
      const middle_name = readStudentOptional(b, 'middleName', 'middle_name')
      const photo_url = readStudentPhotoUrl(b)
      const app_password_gmail = readStudentOptional(b, 'appPasswordGmail', 'app_password_gmail')
      const section_id = parseStudentSectionId(b)
      const password_hash = await hashStudentPassword(password)
      const { rows } = await pool.query(
        `
          INSERT INTO students (
            photo_url, first_name, middle_name, last_name, email, contact_no, address, dob,
            parent_contact, parent_email, enrollment_no, roll_no, grade_level, quarter, section_id,
            login_id, password_hash, app_password_gmail
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::date, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
          RETURNING id, photo_url, first_name, middle_name, last_name, email, contact_no, address, dob,
            parent_contact, parent_email, enrollment_no, roll_no, grade_level, quarter, section_id, login_id, app_password_gmail, created_at
        `,
        [
          photo_url,
          first_name,
          middle_name,
          last_name,
          email,
          contact_no,
          address,
          dobParsed.value,
          parent_contact,
          parent_email,
          enrollment_no,
          roll_no,
          grade_level,
          quarter,
          section_id,
          login_id,
          password_hash,
          app_password_gmail,
        ],
      )
      const row = rows?.[0]
      await auditInstituteRecord(adminSession, 'STUDENT_CREATED', {
        recordType: 'student',
        recordId: String(row?.id ?? ''),
        description: `Student created: ${buildStudentAuditTargetName(row)}`,
      })
      res.status(201).json({ ok: true, student: omitStudentPassword(row) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          error: 'DUPLICATE',
          message: 'A student with this email, enrollment number, or login id already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Invalid section_id: section does not exist.',
        })
        return
      }
      logStatePostgresError('POST /v1/students', e)
      res.status(500).json({
        error: 'STUDENTS_INSERT_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  router.put('/v1/students/:id', async (req, res) => {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return

      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ error: 'BAD_REQUEST', message: 'Invalid student id.' })
        return
      }
      const b = req.body || {}
      const dobParsed = parseStudentDob(b)
      if (!dobParsed.ok) {
        res.status(400).json({ error: 'BAD_REQUEST', message: dobParsed.error })
        return
      }
      const first_name = readStudentField(b, 'firstName', 'first_name')
      const last_name = readStudentField(b, 'lastName', 'last_name')
      const email = readStudentField(b, 'email', 'email')
      const contact_no = readStudentContact(b)
      const address = readStudentField(b, 'address', 'address')
      const parent_contact = readStudentParentContact(b)
      const parent_email = readStudentField(b, 'parentEmail', 'parent_email')
      const enrollment_no = readStudentField(b, 'enrollmentNo', 'enrollment_no')
      const roll_no = readStudentField(b, 'rollNo', 'roll_no')
      const grade_level = readStudentField(b, 'gradeLevel', 'grade_level')
      const quarter = readStudentField(b, 'quarter', 'quarter')
      const login_id = readStudentField(b, 'loginId', 'login_id')
      if (
        !first_name ||
        !last_name ||
        !email ||
        !contact_no ||
        !address ||
        !parent_contact ||
        !parent_email ||
        !enrollment_no ||
        !roll_no ||
        !grade_level ||
        !quarter ||
        !login_id
      ) {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Update requires all non-password fields (same as create, omit password to keep current).',
        })
        return
      }
      const middle_name = readStudentOptional(b, 'middleName', 'middle_name')
      const photoFromBody = readStudentPhotoUrl(b)
      const section_id = parseStudentSectionId(b)
      const newPassword = readStudentField(b, 'password', 'password')
      const appPwRaw = readStudentAppPassword(b)
      const photoSent =
        (b?.photo_url != null && String(b.photo_url).trim() !== '') ||
        (b?.photoDataUrl != null && String(b.photoDataUrl).trim() !== '') ||
        (b?.studentPhotoUrl != null && String(b.studentPhotoUrl).trim() !== '') ||
        (b?.photoUrl != null && String(b.photoUrl).trim() !== '')

      const existing = await pool.query(
        `
          SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name, s.email, s.contact_no,
            s.address, s.dob, s.parent_contact, s.parent_email, s.enrollment_no, s.roll_no,
            s.grade_level, s.quarter, s.section_id, s.login_id, s.password_hash, s.app_password_gmail,
            sec.section_name
          FROM students s
          LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1 AND s.archived_at IS NULL
        `,
        [id],
      )
      if (!existing.rows?.length) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }
      const oldRow = existing.rows[0]
      const photo_url =
        photoSent && photoFromBody ? photoFromBody : oldRow.photo_url || photoFromBody || null

      let newSectionName = ''
      if (section_id != null) {
        const secRow = await pool.query('SELECT section_name FROM sections WHERE id = $1', [section_id])
        newSectionName = String(secRow.rows?.[0]?.section_name || '').trim()
      }

      const newData = {
        firstName: first_name,
        middleName: middle_name || '',
        lastName: last_name,
        email,
        phoneNumber: contact_no,
        address,
        dateOfBirth: dobParsed.value,
        parentPhone: parent_contact,
        parentEmail: parent_email,
        enrollmentNo: enrollment_no,
        rollNo: roll_no,
        gradeLevel: grade_level,
        quarter,
        section: newSectionName,
        sectionId: section_id,
        loginId: login_id,
        photoUrl: photo_url || '',
      }

      const passwordChanged = Boolean(newPassword)
      const appPasswordInBody = Boolean(appPwRaw)
      const photoChanged = photoSent && normStr(photo_url) !== normStr(oldRow.photo_url)

      const detailedDiffs = computeStudentProfileDetailedDiffs(oldRow, newData, {
        passwordChanged,
        appPasswordInBody,
        photoChanged,
      })
      const updatedFields = Object.keys(detailedDiffs)

      let password_hash = oldRow.password_hash
      if (newPassword) {
        password_hash = /^\$2[aby]\$\d{2}\$/.test(newPassword)
          ? newPassword
          : await hashStudentPassword(newPassword)
      }
      let app_password_gmail = oldRow.app_password_gmail
      if (appPwRaw) {
        app_password_gmail = appPwRaw
      }
      const actorId = String(adminSession.user?.id || adminSession.data?.user?.id || '')
      const baseValues = [
        photo_url,
        first_name,
        middle_name,
        last_name,
        email,
        contact_no,
        address,
        dobParsed.value,
        parent_contact,
        parent_email,
        enrollment_no,
        roll_no,
        grade_level,
        quarter,
        section_id,
        login_id,
        password_hash,
        app_password_gmail,
      ]
      const baseSet = `
            photo_url = $1, first_name = $2, middle_name = $3, last_name = $4, email = $5,
            contact_no = $6, address = $7, dob = $8::date, parent_contact = $9, parent_email = $10,
            enrollment_no = $11, roll_no = $12, grade_level = $13, quarter = $14, section_id = $15,
            login_id = $16, password_hash = $17, app_password_gmail = $18`
      const extended = await extendUpdateSetWithIntegrity(
        pool,
        'students',
        baseSet,
        baseValues,
        actorId,
        19,
      )
      extended.values.push(id)
      const r = await pool.query(
        `
          UPDATE students SET ${extended.setClause}
          WHERE id = $${extended.nextParamIndex} AND archived_at IS NULL
        `,
        extended.values,
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ error: 'NOT_FOUND', message: 'Student not found.' })
        return
      }

      await auditInstituteRecord(adminSession, 'STUDENT_UPDATED', {
        recordType: 'student',
        recordId: String(id),
        description: `Student updated: ${buildStudentAuditTargetName({ ...oldRow, first_name, middle_name, last_name, email })}`,
      })

      if (updatedFields.length > 0) {
        try {
          const actor = adminSession.user || adminSession.data?.user || {}
          const actorId = String(actor.id || '').trim()
          const targetEmail = email.toLowerCase()
          const authUserId = (await findAuthUserIdByEmail(targetEmail)) || `student-record:${id}`
          await customActivityLogger.logUserAccountChanged(authUserId, {
            actorUserId: actorId,
            actorName: String(actor.name || '').trim(),
            actorEmail: String(actor.email || '').trim(),
            actorRole: String(actor.role || 'admin').trim(),
            triggerContext: 'admin',
            userName: buildStudentAuditTargetName({ ...oldRow, first_name, middle_name, last_name, email }),
            userEmail: targetEmail,
            targetRole: 'student',
            updatedFields,
            detailedDiffs,
            source: 'admin',
            studentRecordId: id,
          })
        } catch (logErr) {
          console.warn('[students] profile audit log failed:', logErr?.message || logErr)
        }
      }

      const { rows } = await pool.query(
        `
          SELECT s.id, s.photo_url, s.first_name, s.middle_name, s.last_name,
            s.email, s.contact_no, s.address, s.dob, s.parent_contact, s.parent_email,
            s.enrollment_no, s.roll_no, s.grade_level, s.quarter, s.section_id,
            s.login_id, s.app_password_gmail, s.created_at,
            sec.section_name AS section_name
          FROM students s
          LEFT JOIN sections sec ON sec.id = s.section_id
          WHERE s.id = $1 AND s.archived_at IS NULL
        `,
        [id],
      )
      res.json({ ok: true, student: omitStudentPassword(rows?.[0]) })
    } catch (e) {
      if (e?.code === '23505') {
        res.status(409).json({
          error: 'DUPLICATE',
          message: 'A student with this email, enrollment number, or login id already exists.',
        })
        return
      }
      if (e?.code === '23503') {
        res.status(400).json({
          error: 'BAD_REQUEST',
          message: 'Invalid section_id: section does not exist.',
        })
        return
      }
      logStatePostgresError('PUT /v1/students/:id', e)
      res.status(500).json({
        error: 'STUDENTS_UPDATE_FAILED',
        message: GENERIC_SERVER_ERROR,
      })
    }
  })

  async function handleArchiveStudent(req, res) {
    try {
      const adminSession = await requireAdminSession(req, res, auth)
      if (!adminSession) return
      if (req.method === 'DELETE' && !requireDestructiveConfirm(req, res, 'DELETE')) return
      const id = Number(req.params.id)
      if (!Number.isFinite(id) || id <= 0) {
        res.status(400).json({ success: false, message: 'Invalid student id.' })
        return
      }
      const archived = await archiveStudentRecord(pool, id)
      if (!archived) {
        res.status(404).json({ success: false, message: 'Student not found or already archived.' })
        return
      }
      await auditInstituteRecord(adminSession, 'STUDENT_DELETED', {
        recordType: 'student',
        recordId: String(id),
        description: `Student archived: ${id}`,
      })
      res.json({ ok: true, success: true, id, archived: true })
    } catch (e) {
      logStatePostgresError('archive student', e)
      sendSafeServerError(res, e, 'archive route')
    }
  }

  router.post('/v1/students/:id/archive', handleArchiveStudent)

  router.delete('/v1/students/:id', async (req, res) => handleArchiveStudent(req, res))

  router.get('/v1/admin/archive-vault/:type', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid archive vault type.' })
      return
    }
    try {
      if (type === 'students') {
        const { rows } = await pool.query(`
          SELECT s.id, s.first_name, s.middle_name, s.last_name, s.archived_at
          FROM students s
          WHERE s.archived_at IS NOT NULL
          ORDER BY s.archived_at DESC, s.id DESC
        `)
        const records = rows.map((r) => obfuscateArchivedStudentForVault(r))
        res.json({ ok: true, type, records, students: records })
        return
      }
      const colSet = await getFacultiesColumnSet(pool)
      const vaultSql = colSet.has('updated_at')
        ? `SELECT id, name, first_name, middle_name, last_name, archived_at ${FACULTIES_FROM} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC NULLS LAST, updated_at DESC NULLS LAST, id DESC`
        : `SELECT id, name, first_name, middle_name, last_name, archived_at ${FACULTIES_FROM} WHERE archived_at IS NOT NULL ORDER BY archived_at DESC NULLS LAST, id DESC`
      const { rows } = await pool.query(vaultSql)
      const records = rows.map((r) => obfuscateArchivedFacultyForVault(r))
      res.json({ ok: true, type, records, faculty: records })
    } catch (e) {
      logStatePostgresError('GET /v1/admin/archive-vault/:type', e)
      sendSafeServerError(res, e, 'GET /v1/admin/archive-vault/:type')
    }
  })

  router.post('/v1/admin/restore/:type/:id', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid archive type.' })
      return
    }
    const rawId = String(req.params.id || '').trim()
    if (!rawId) {
      res.status(400).json({ success: false, message: 'Invalid id.' })
      return
    }
    try {
      if (type === 'students') {
        const id = Number(rawId)
        if (!Number.isFinite(id) || id <= 0) {
          res.status(400).json({ success: false, message: 'Invalid student id.' })
          return
        }
        const r = await pool.query(
          'UPDATE public.students SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL',
          [id],
        )
        if (Number(r?.rowCount ?? 0) === 0) {
          res.status(404).json({
            success: false,
            message: 'Record not found or not currently archived.',
          })
          return
        }
        res.json({ ok: true, success: true, type, id: String(id) })
        return
      }
      const r = await pool.query(
        'UPDATE public.faculties SET archived_at = NULL WHERE id = $1 AND archived_at IS NOT NULL',
        [rawId],
      )
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({
          success: false,
          message: 'Record not found or not currently archived.',
        })
        return
      }
      res.json({ ok: true, success: true, type, id: rawId })
    } catch (e) {
      logStatePostgresError('POST /v1/admin/restore/:type/:id', e)
      sendSafeServerError(res, e, 'POST /v1/admin/restore/:type/:id')
    }
  })

  router.delete('/v1/admin/permanent-purge/:type/:id', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    if (!requireDestructiveConfirm(req, res, 'PURGE')) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid archive type.' })
      return
    }
    const rawId = String(req.params.id || '').trim()
    if (!rawId) {
      res.status(400).json({ success: false, message: 'Invalid id.' })
      return
    }
    const idParam = type === 'students' ? Number(rawId) : rawId
    if (type === 'students' && (!Number.isFinite(idParam) || idParam <= 0)) {
      res.status(400).json({ success: false, message: 'Invalid student id.' })
      return
    }
    const tableSql = resolveArchiveTableSql(type)
    if (!tableSql) {
      res.status(400).json({ success: false, message: 'Invalid archive type.' })
      return
    }
    try {
      const record = await pool.query(`SELECT archived_at FROM ${tableSql} WHERE id = $1`, [idParam])
      if (!record.rows[0]?.archived_at) {
        res.status(404).json({ success: false, message: 'Record is not in archive.' })
        return
      }

      const archivedAt = new Date(record.rows[0].archived_at)
      const oneYearAgo = new Date()
      oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1)

      if (archivedAt > oneYearAgo) {
        res.status(403).json({
          success: false,
          message:
            'Security Restriction: Account must satisfy a 1-year retention hold before purging.',
        })
        return
      }

      await pool.query(`DELETE FROM ${tableSql} WHERE id = $1`, [idParam])
      res.json({ ok: true, success: true, type, id: String(rawId), purged: true })
    } catch (e) {
      logStatePostgresError('DELETE /v1/admin/permanent-purge/:type/:id', e)
      sendSafeServerError(res, e, 'DELETE /v1/admin/permanent-purge/:type/:id')
    }
  })

  /** Active-roster bypass: hard-delete without archive vault or retention gate (admin only). */
  router.delete('/v1/admin/immediate-purge/:type/:id', async (req, res) => {
    if (!(await requireAdminSession(req, res, auth))) return
    if (!requireDestructiveConfirm(req, res, 'DELETE_IMMEDIATE')) return
    const type = parseArchiveEntityType(req.params.type)
    if (!type) {
      res.status(400).json({ success: false, message: 'Invalid entity type.' })
      return
    }
    const rawId = String(req.params.id || '').trim()
    if (!rawId) {
      res.status(400).json({ success: false, message: 'Invalid id.' })
      return
    }
    const idParam = type === 'students' ? Number(rawId) : rawId
    if (type === 'students' && (!Number.isFinite(idParam) || idParam <= 0)) {
      res.status(400).json({ success: false, message: 'Invalid student id.' })
      return
    }
    const tableSql = resolveArchiveTableSql(type)
    if (!tableSql) {
      res.status(400).json({ success: false, message: 'Invalid entity type.' })
      return
    }
    try {
      const r = await pool.query(`DELETE FROM ${tableSql} WHERE id = $1`, [idParam])
      if (Number(r?.rowCount ?? 0) === 0) {
        res.status(404).json({ success: false, message: 'Record not found.' })
        return
      }
      if (type === 'faculties') {
        await purgeFacultyFromAppStateJson(pool, String(rawId))
      }
      res.json({ ok: true, success: true, type, id: String(rawId), purged: true, immediate: true })
    } catch (e) {
      logStatePostgresError('DELETE /v1/admin/immediate-purge/:type/:id', e)
      sendSafeServerError(res, e, 'DELETE /v1/admin/immediate-purge/:type/:id')
    }
  })

  return {
    router,
    close: async () => {
      /* Shared pool: closed by closePgPool() from server/index.js */
    },
  }
}
