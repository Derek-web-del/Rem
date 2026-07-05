import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { createHmac, timingSafeEqual, randomUUID, createHash } from 'node:crypto'
import { PassThrough } from 'node:stream'
import { finished, pipeline } from 'node:stream/promises'
import { spawn } from 'node:child_process'
import { tmpdir } from 'node:os'
import { createRequire } from 'node:module'
import { getPgPool } from '../pgPool.js'
import {
  STATE_ID,
  syncAppStateMirrorsAfterRestore,
  getFacultiesColumnSet,
  facultyPgRowToAppStateMirror,
  mergeFacultyMirrorsIntoAppStateJson,
  curriculumPgRowToAppStateMirror,
  mergeCurriculumMirrorsIntoAppStateJson,
  sectionPgRowToAppStateMirror,
  mergeSectionMirrorsIntoAppStateJson,
} from '../api/state/shared.js'
import { filterFacultyRowKeys } from './sqlGuards.js'
import { repairFacultyAuthLinks, buildFacultyRestoreReport } from './repairFacultyAuthLinks.js'
import { repairStudentAuthLinks } from './repairStudentAuthLinks.js'
import { uploadsRoot, subjectAssetsRoot, resolvePublicUploadPath } from './uploadPaths.js'

const require = createRequire(import.meta.url)
const archiverLib = require('archiver')
const unzipperLib = require('unzipper')

function resolveArchiverFactory(mod) {
  if (typeof mod === 'function') return mod
  if (typeof mod?.default === 'function') return mod.default
  if (mod?.ZipArchive && mod?.TarArchive) {
    return (format, options = {}) => {
      if (format === 'zip') return new mod.ZipArchive(options)
      if (format === 'tar') return new mod.TarArchive(options)
      if (format === 'json' && mod.JsonArchive) return new mod.JsonArchive(options)
      throw new Error(`Unsupported archiver format: ${format}`)
    }
  }
  const fn = Object.values(mod || {}).find((v) => typeof v === 'function')
  if (fn) return fn
  throw new Error('Could not resolve archiver factory from module exports')
}

const archiver = resolveArchiverFactory(archiverLib)
const unzipper = unzipperLib.default ?? unzipperLib

export const BACKUPS_DIR = path.join(process.cwd(), 'backups')
export const BACKUP_UPLOADS_DIR = path.join(BACKUPS_DIR, '.uploads')
export const UPLOADS_DIR = uploadsRoot()
export const SUBJECT_ASSETS_DIR = subjectAssetsRoot()

export const LNBAK_TABLE_ORDER = [
  'user',
  'account',
  'curriculum',
  'curriculum_guides',
  'sections',
  'faculties',
  'faculty_sections',
  'subjects',
  'subject_topics',
  'subject_modules',
  'students',
  'announcements',
  'study_materials',
  'subject_materials',
  'assignments',
  'activities',
  'assignment_submissions',
  'activity_submissions',
  'quizzes',
  'quiz_password_access',
  'quiz_parts',
  'quiz_questions',
  'quiz_choices',
  'quiz_answers',
  'quiz_submissions',
  'quiz_student_answers',
  'plagiarism_reports',
  'audit_logs',
  'lms_activity_logs',
]

const TRUNCATE_ORDER = [...LNBAK_TABLE_ORDER].reverse()

/** Skip child restore when backup has no parent rows (older .lnbak files). */
const RESTORE_PARENT_KEYS = {
  faculty_sections: 'faculties',
  assignment_submissions: 'assignments',
  activity_submissions: 'activities',
  subject_modules: 'subjects',
  subject_topics: 'subjects',
  quiz_parts: 'quizzes',
  quiz_questions: 'quizzes',
  quiz_choices: 'quizzes',
  quiz_answers: 'quizzes',
  quiz_submissions: 'quizzes',
  quiz_student_answers: 'quiz_submissions',
  quiz_password_access: 'quizzes',
}

const TABLE_FROM_SQL = {
  user: '"user"',
  account: 'account',
  curriculum: 'public.curriculum',
  curriculum_guides: 'public.curriculum_guides',
  sections: 'public.sections',
  faculties: 'public.faculties',
  faculty_sections: 'public.faculty_sections',
  subjects: 'public.subjects',
  subject_modules: 'public.subject_modules',
  subject_topics: 'public.subject_topics',
  students: 'public.students',
  announcements: 'public.announcements',
  study_materials: 'public.study_materials',
  subject_materials: 'public.subject_materials',
  assignments: 'public.assignments',
  activities: 'public.activities',
  assignment_submissions: 'public.assignment_submissions',
  activity_submissions: 'public.activity_submissions',
  quizzes: 'public.quizzes',
  quiz_password_access: 'public.quiz_password_access',
  quiz_parts: 'public.quiz_parts',
  quiz_questions: 'public.quiz_questions',
  quiz_choices: 'public.quiz_choices',
  quiz_answers: 'public.quiz_answers',
  quiz_submissions: 'public.quiz_submissions',
  quiz_student_answers: 'public.quiz_student_answers',
  plagiarism_reports: 'public.plagiarism_reports',
  audit_logs: 'public.audit_logs',
  lms_activity_logs: 'public.lms_activity_logs',
}

const TABLE_SELECT_SQL = {
  user: 'SELECT * FROM "user" ORDER BY id',
  account: 'SELECT * FROM account ORDER BY id',
  curriculum: 'SELECT * FROM public.curriculum ORDER BY id',
  curriculum_guides: 'SELECT * FROM public.curriculum_guides ORDER BY COALESCE(created_at, updated_at) NULLS LAST, id',
  sections: 'SELECT * FROM public.sections ORDER BY id',
  faculties: 'SELECT * FROM public.faculties ORDER BY updated_at DESC NULLS LAST, id',
  faculty_sections: 'SELECT * FROM public.faculty_sections ORDER BY faculty_id, section_id',
  subjects: 'SELECT * FROM public.subjects ORDER BY id',
  subject_modules: 'SELECT * FROM public.subject_modules ORDER BY subject_id, module_order ASC, id ASC',
  subject_topics: 'SELECT * FROM public.subject_topics ORDER BY subject_id, topic_order ASC, id ASC',
  students: 'SELECT * FROM public.students ORDER BY id',
  announcements: 'SELECT * FROM public.announcements ORDER BY created_at NULLS LAST, id',
  study_materials: 'SELECT * FROM public.study_materials ORDER BY id',
  subject_materials: 'SELECT * FROM public.subject_materials ORDER BY id',
  assignments: 'SELECT * FROM public.assignments ORDER BY id',
  activities: 'SELECT * FROM public.activities ORDER BY id',
  assignment_submissions: 'SELECT * FROM public.assignment_submissions ORDER BY id',
  activity_submissions: 'SELECT * FROM public.activity_submissions ORDER BY id',
  quizzes: 'SELECT * FROM public.quizzes ORDER BY id',
  quiz_password_access: 'SELECT * FROM public.quiz_password_access ORDER BY quiz_id, auth_user_id',
  quiz_parts: 'SELECT * FROM public.quiz_parts ORDER BY id',
  quiz_questions: 'SELECT * FROM public.quiz_questions ORDER BY id',
  quiz_choices: 'SELECT * FROM public.quiz_choices ORDER BY id',
  quiz_answers: 'SELECT * FROM public.quiz_answers ORDER BY id',
  quiz_submissions: 'SELECT * FROM public.quiz_submissions ORDER BY id',
  quiz_student_answers: 'SELECT * FROM public.quiz_student_answers ORDER BY id',
  plagiarism_reports: 'SELECT * FROM public.plagiarism_reports ORDER BY id',
  audit_logs: 'SELECT * FROM public.audit_logs ORDER BY created_at NULLS LAST, id',
  lms_activity_logs: 'SELECT * FROM public.lms_activity_logs ORDER BY "timestamp" NULLS LAST, id',
}

const TABLES_WITH_SERIAL_ID = new Set([
  'curriculum',
  'sections',
  'subjects',
  'subject_modules',
  'subject_topics',
  'students',
  'announcements',
  'study_materials',
  'subject_materials',
  'assignments',
  'activities',
  'assignment_submissions',
  'activity_submissions',
  'quizzes',
  'quiz_parts',
  'quiz_questions',
  'quiz_choices',
  'quiz_answers',
  'quiz_submissions',
  'quiz_student_answers',
  'plagiarism_reports',
  'audit_logs',
])

const MIN_RESTORE_TABLE_KEYS = 5

export function ensureBackupsDirectory() {
  fs.mkdirSync(BACKUPS_DIR, { recursive: true })
  fs.mkdirSync(BACKUP_UPLOADS_DIR, { recursive: true })
}

export function getLatestMigrationFilename() {
  const dir = path.join(process.cwd(), 'Database', 'migrations')
  try {
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
    return files[files.length - 1] || 'unknown'
  } catch {
    return 'unknown'
  }
}

function rowToJson(row) {
  const out = {}
  for (const [k, v] of Object.entries(row)) {
    if (v instanceof Date) out[k] = v.toISOString()
    else if (Buffer.isBuffer(v)) out[k] = v.toString('base64')
    else if (v !== null && typeof v === 'object') out[k] = v
    else out[k] = v
  }
  return out
}

function tableNameFromKey(tableKey) {
  const from = TABLE_FROM_SQL[tableKey]
  if (!from) return null
  return from.replace(/^public\./, '').replace(/"/g, '')
}

async function tableExists(pool, tableKey) {
  const bare = tableNameFromKey(tableKey)
  if (!bare) return false
  try {
    const { rows } = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1 LIMIT 1`,
      [bare],
    )
    return rows.length > 0
  } catch {
    return false
  }
}

function compareMigrationFilename(a, b) {
  return String(a || '').localeCompare(String(b || ''))
}

function shouldSkipRestoreTable(parsed, tableKey) {
  const parentKey = RESTORE_PARENT_KEYS[tableKey]
  if (!parentKey) return false
  const parentRows = parsed.data?.[parentKey]
  return !Array.isArray(parentRows) || parentRows.length === 0
}

function normRefId(value) {
  const s = String(value ?? '').trim()
  return s || null
}

/** @param {{ data?: Record<string, unknown[]> }} parsed */
export function buildFacultyIdSet(parsed) {
  const rows = parsed?.data?.faculties
  if (!Array.isArray(rows)) return new Set()
  return new Set(rows.map((r) => normRefId(r.id)).filter(Boolean))
}

/** @param {{ data?: Record<string, unknown[]> }} parsed */
export function buildSectionIdSet(parsed) {
  const rows = parsed?.data?.sections
  if (!Array.isArray(rows)) return new Set()
  const set = new Set()
  for (const r of rows) {
    if (r.id == null || r.id === '') continue
    set.add(String(r.id).trim())
    const n = Number(r.id)
    if (Number.isFinite(n)) set.add(String(n))
  }
  return set
}

function sectionIdInSet(sectionIds, sectionId) {
  if (sectionId == null || sectionId === '') return false
  const s = String(sectionId).trim()
  if (sectionIds.has(s)) return true
  const n = Number(sectionId)
  return Number.isFinite(n) && sectionIds.has(String(n))
}

/** @param {Record<string, unknown>[]} rows */
export function buildNumericIdSetFromRows(rows) {
  if (!Array.isArray(rows)) return new Set()
  const set = new Set()
  for (const r of rows) {
    if (r.id == null || r.id === '') continue
    set.add(String(r.id).trim())
    const n = Number(r.id)
    if (Number.isFinite(n)) set.add(String(n))
  }
  return set
}

/** @param {{ data?: Record<string, unknown[]> }} parsed */
export function buildNumericIdSetFromParsed(parsed, tableKey) {
  return buildNumericIdSetFromRows(parsed?.data?.[tableKey])
}

export function idInNumericSet(idSet, id) {
  if (id == null || id === '') return false
  const s = String(id).trim()
  if (idSet.has(s)) return true
  const n = Number(id)
  return Number.isFinite(n) && idSet.has(String(n))
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Set<string>} parentIds
 * @param {{ parentColumn: string, optionalColumn?: string, optionalIds?: Set<string> }} opts
 */
export function sanitizeChildFkRows(rows, parentIds, { parentColumn, optionalColumn, optionalIds }) {
  if (!Array.isArray(rows)) return { rows: [], skipped: 0 }
  const out = []
  let skipped = 0
  for (const row of rows) {
    if (!idInNumericSet(parentIds, row[parentColumn])) {
      skipped += 1
      continue
    }
    if (optionalColumn && optionalIds && optionalIds.size > 0) {
      const ref = row[optionalColumn]
      if (ref != null && ref !== '' && !idInNumericSet(optionalIds, ref)) {
        skipped += 1
        continue
      }
    }
    out.push({ ...row })
  }
  return { rows: out, skipped }
}

/** Parent ids that will actually be inserted (after faculty / other sanitization). */
function getEffectiveParentIds(parsed, parentTableKey) {
  const raw = parsed.data?.[parentTableKey]
  if (!Array.isArray(raw) || raw.length === 0) return new Set()
  const prepared = prepareRestoreRowsForInsert(parsed, parentTableKey, raw)
  return buildNumericIdSetFromRows(prepared)
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Set<string>} facultyIds
 * @param {{ column?: string, allowNull?: boolean }} opts
 */
export function sanitizeFacultyFkRows(rows, facultyIds, { column = 'faculty_id', allowNull = true } = {}) {
  if (!Array.isArray(rows)) return { rows: [], nulled: 0, skipped: 0 }
  const out = []
  let nulled = 0
  let skipped = 0
  for (const row of rows) {
    const copy = { ...row }
    const fid = normRefId(copy[column])
    if (fid && !facultyIds.has(fid)) {
      if (allowNull) {
        copy[column] = null
        nulled += 1
        out.push(copy)
      } else {
        skipped += 1
      }
      continue
    }
    out.push(copy)
  }
  return { rows: out, nulled, skipped }
}

/**
 * @param {Record<string, unknown>[]} rows
 * @param {Set<string>} facultyIds
 * @param {Set<string>} sectionIds
 */
export function sanitizeFacultySectionRows(rows, facultyIds, sectionIds) {
  if (!Array.isArray(rows)) return { rows: [], skipped: 0 }
  const out = []
  let skipped = 0
  for (const row of rows) {
    const fid = normRefId(row.faculty_id)
    if (fid && !facultyIds.has(fid)) {
      skipped += 1
      continue
    }
    if (!sectionIdInSet(sectionIds, row.section_id)) {
      skipped += 1
      continue
    }
    out.push({ ...row })
  }
  return { rows: out, skipped }
}

const FACULTY_FK_NULL_ON_RESTORE = new Set(['subjects'])
const FACULTY_FK_SKIP_ON_RESTORE = new Set(['assignments', 'activities', 'plagiarism_reports'])
const TOPIC_ID_NULL_ON_RESTORE = new Set([
  'subject_modules',
  'study_materials',
  'assignments',
  'activities',
  'quizzes',
])

/** Clear invalid topic_id before insert (FK → subject_topics). */
export function sanitizeOptionalTopicIdRows(rows, topicIds) {
  if (!Array.isArray(rows)) return { rows: [], nulled: 0 }
  const out = []
  let nulled = 0
  for (const row of rows) {
    const copy = { ...row }
    const tid = copy.topic_id
    if (
      tid === '' ||
      tid == null ||
      tid === 'uncategorized' ||
      tid === 'null' ||
      tid === 'undefined'
    ) {
      if (tid != null && tid !== '') {
        copy.topic_id = null
        nulled += 1
      }
      out.push(copy)
      continue
    }
    if (!idInNumericSet(topicIds, tid)) {
      copy.topic_id = null
      nulled += 1
    }
    out.push(copy)
  }
  return { rows: out, nulled }
}

/** @param {{ data?: Record<string, unknown[]> }} parsed */
export function prepareRestoreRowsForInsert(parsed, tableKey, rawRows) {
  if (!Array.isArray(rawRows) || rawRows.length === 0) return []
  const facultyIds = buildFacultyIdSet(parsed)
  const sectionIds = buildSectionIdSet(parsed)

  if (tableKey === 'faculty_sections') {
    const { rows, skipped } = sanitizeFacultySectionRows(rawRows, facultyIds, sectionIds)
    if (skipped > 0) {
      console.warn(
        `[BACKUP] Dropped ${skipped} faculty_sections row(s) with invalid faculty_id or section_id`,
      )
    }
    return rows
  }

  if (FACULTY_FK_NULL_ON_RESTORE.has(tableKey)) {
    const { rows, nulled } = sanitizeFacultyFkRows(rawRows, facultyIds, { allowNull: true })
    if (nulled > 0) {
      console.warn(
        `[BACKUP] Cleared faculty_id on ${nulled} ${tableKey} row(s) — assigned faculty not in backup`,
      )
    }
    return rows
  }

  if (FACULTY_FK_SKIP_ON_RESTORE.has(tableKey)) {
    const { rows, skipped } = sanitizeFacultyFkRows(rawRows, facultyIds, { allowNull: false })
    if (skipped > 0) {
      console.warn(`[BACKUP] Skipped ${skipped} ${tableKey} row(s) with invalid faculty_id`)
    }
    return rows
  }

  if (tableKey === 'assignment_submissions') {
    const assignmentIds = getEffectiveParentIds(parsed, 'assignments')
    const studentIds = buildNumericIdSetFromParsed(parsed, 'students')
    const { rows, skipped } = sanitizeChildFkRows(rawRows, assignmentIds, {
      parentColumn: 'assignment_id',
      optionalColumn: 'student_id',
      optionalIds: studentIds,
    })
    if (skipped > 0) {
      console.warn(
        `[BACKUP] Skipped ${skipped} assignment_submissions row(s) with invalid assignment_id or student_id`,
      )
    }
    return rows
  }

  if (tableKey === 'activity_submissions') {
    const activityIds = getEffectiveParentIds(parsed, 'activities')
    const studentIds = buildNumericIdSetFromParsed(parsed, 'students')
    const { rows, skipped } = sanitizeChildFkRows(rawRows, activityIds, {
      parentColumn: 'activity_id',
      optionalColumn: 'student_id',
      optionalIds: studentIds,
    })
    if (skipped > 0) {
      console.warn(
        `[BACKUP] Skipped ${skipped} activity_submissions row(s) with invalid activity_id or student_id`,
      )
    }
    return rows
  }

  if (tableKey === 'quiz_submissions') {
    const quizIds = getEffectiveParentIds(parsed, 'quizzes')
    const { rows, skipped } = sanitizeChildFkRows(rawRows, quizIds, { parentColumn: 'quiz_id' })
    if (skipped > 0) {
      console.warn(`[BACKUP] Skipped ${skipped} quiz_submissions row(s) with invalid quiz_id`)
    }
    return rows
  }

  if (tableKey === 'quiz_student_answers') {
    const submissionIds = getEffectiveParentIds(parsed, 'quiz_submissions')
    const questionIds = getEffectiveParentIds(parsed, 'quiz_questions')
    const out = []
    let skipped = 0
    for (const row of rawRows) {
      if (!idInNumericSet(submissionIds, row.submission_id)) {
        skipped += 1
        continue
      }
      if (!idInNumericSet(questionIds, row.question_id)) {
        skipped += 1
        continue
      }
      out.push({ ...row })
    }
    if (skipped > 0) {
      console.warn(`[BACKUP] Skipped ${skipped} quiz_student_answers row(s) with invalid parent ids`)
    }
    return out
  }

  if (TOPIC_ID_NULL_ON_RESTORE.has(tableKey)) {
    const topicIds = getEffectiveParentIds(parsed, 'subject_topics')
    const { rows, nulled } = sanitizeOptionalTopicIdRows(rawRows, topicIds)
    if (nulled > 0) {
      console.warn(
        `[BACKUP] Cleared topic_id on ${nulled} ${tableKey} row(s) — topic not in backup or invalid`,
      )
    }
    if (tableKey === 'study_materials') {
      const subjectIds = getEffectiveParentIds(parsed, 'subjects')
      let subjectNulled = 0
      const withSubject = rows.map((row) => {
        const copy = { ...row }
        const sid = copy.subject_id
        if (sid != null && sid !== '' && !idInNumericSet(subjectIds, sid)) {
          copy.subject_id = null
          subjectNulled += 1
        }
        return copy
      })
      if (subjectNulled > 0) {
        console.warn(
          `[BACKUP] Cleared subject_id on ${subjectNulled} study_materials row(s) — subject not in backup`,
        )
      }
      return withSubject
    }
    return rows
  }

  return rawRows.map((r) => ({ ...r }))
}

function warnOrphanFacultyRefsInParsed(parsed) {
  const facultyIds = buildFacultyIdSet(parsed)
  const subjects = parsed?.data?.subjects
  if (!Array.isArray(subjects) || facultyIds.size === 0) return
  const orphans = new Set()
  for (const row of subjects) {
    const fid = normRefId(row.faculty_id)
    if (fid && !facultyIds.has(fid)) orphans.add(fid)
  }
  if (orphans.size > 0) {
    console.warn(
      `[BACKUP] Backup has ${orphans.size} subject faculty_id value(s) not in faculties list; will clear on restore:`,
      [...orphans].join(', '),
    )
  }
}

/** Non-blocking warnings shown to admins before/after restore. */
export function collectRestorePreflightWarnings(parsed) {
  const warnings = []
  const faculties = parsed?.data?.faculties
  const users = parsed?.data?.user
  const subjects = parsed?.data?.subjects
  const facCount = Array.isArray(faculties) ? faculties.length : 0
  const userRows = Array.isArray(users) ? users : []
  const teacherCount = userRows.filter(
    (u) => String(u.role || '').trim().toLowerCase() === 'teacher',
  ).length

  if (
    facCount === 0 &&
    Array.isArray(subjects) &&
    subjects.some((s) => normRefId(s.faculty_id))
  ) {
    warnings.push(
      'Backup has no faculty roster rows but subjects reference faculty — assigned faculty will be cleared on restore.',
    )
  }
  if (facCount > 0 && teacherCount === 0) {
    warnings.push(
      'Backup has faculty profiles but no teacher auth users — faculty login may not work until accounts are repaired.',
    )
  }
  if (facCount === 0 && !Array.isArray(parsed?.data?.app_state)?.length) {
    warnings.push(
      'Backup has no faculties and no app_state snapshot — institute faculty list may be empty after restore.',
    )
  }

  const curriculumRows = parsed?.data?.curriculum
  const curriculumCount = Array.isArray(curriculumRows) ? curriculumRows.length : 0
  let snapshotCurriculumCount = 0
  const appRows = parsed?.data?.app_state
  if (Array.isArray(appRows) && appRows.length > 0) {
    snapshotCurriculumCount = countCurriculumsInAppStateSnapshot(appRows)
  }
  if (curriculumCount === 0 && snapshotCurriculumCount === 0) {
    warnings.push(
      'Backup has no curriculum rows and no app_state curriculum guides — Curriculum page may be empty after restore.',
    )
  }

  const students = parsed?.data?.students
  const studentCount = Array.isArray(students) ? students.length : 0
  const sections = parsed?.data?.sections
  const sectionCount = Array.isArray(sections) ? sections.length : 0
  const subjectCount = Array.isArray(subjects) ? subjects.length : 0

  if (studentCount === 0) {
    warnings.push(
      'Backup has no student roster rows — Students page may be empty after restore.',
    )
  }
  if (sectionCount === 0) {
    let snapshotSectionCount = 0
    if (Array.isArray(appRows) && appRows.length > 0) {
      snapshotSectionCount = countSectionsInAppStateSnapshot(appRows)
    }
    if (snapshotSectionCount === 0) {
      warnings.push(
        'Backup has no section rows and no app_state sections — institute sections may be empty after restore.',
      )
    }
  }
  if (subjectCount === 0) {
    warnings.push('Backup has no subject rows — Subjects list may be empty after restore.')
  }

  return warnings
}

async function loadActiveSectionMirrors(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT id, section_name, grade_level FROM public.sections ORDER BY id`,
    )
    return (rows || []).map((r) => sectionPgRowToAppStateMirror(r)).filter(Boolean)
  } catch (e) {
    console.warn('[BACKUP] Could not load sections for app_state enrichment:', e?.message || e)
    return []
  }
}

async function loadActiveFacultyMirrors(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM public.faculties WHERE archived_at IS NULL ORDER BY updated_at DESC NULLS LAST, id`,
    )
    return (rows || []).map((r) => facultyPgRowToAppStateMirror(r)).filter(Boolean)
  } catch (e) {
    console.warn('[BACKUP] Could not load active faculties for app_state enrichment:', e?.message || e)
    return []
  }
}

async function loadActiveCurriculumMirrors(pool) {
  try {
    const { rows } = await pool.query(`
      SELECT c.id, c.title, c.description, c.grade_level, c.file_name, c.source_id,
             g.file_type, g.file_data_url, g.uploaded_at, g.uploaded_by, g.uploaded_by_name,
             g.grade AS guide_grade, g.subject AS guide_subject, g.description AS guide_description,
             g.file_name AS guide_file_name
      FROM public.curriculum c
      LEFT JOIN curriculum_guides g ON g.id = COALESCE(NULLIF(trim(c.source_id), ''), c.id::text)
      ORDER BY c.id DESC
    `)
    return (rows || [])
      .map((r) =>
        curriculumPgRowToAppStateMirror(
          {
            id: r.id,
            title: r.title,
            description: r.description,
            grade_level: r.grade_level,
            file_name: r.file_name || r.guide_file_name,
            source_id: r.source_id,
          },
          {
            file_type: r.file_type,
            file_data_url: r.file_data_url,
            uploaded_at: r.uploaded_at,
            uploaded_by: r.uploaded_by,
            uploaded_by_name: r.uploaded_by_name,
            grade: r.guide_grade,
            subject: r.guide_subject,
            description: r.guide_description,
            file_name: r.guide_file_name,
          },
        ),
      )
      .filter(Boolean)
  } catch (e) {
    console.warn('[BACKUP] Could not load curriculum for app_state enrichment:', e?.message || e)
    return []
  }
}

export async function exportAppStateSnapshot(pool) {
  const pgFacultyMirrors = await loadActiveFacultyMirrors(pool)
  const pgCurriculumMirrors = await loadActiveCurriculumMirrors(pool)
  const pgSectionMirrors = await loadActiveSectionMirrors(pool)
  try {
    const { rows } = await pool.query(
      `SELECT id, json, updated_at FROM app_state WHERE id = $1 LIMIT 1`,
      [STATE_ID],
    )
    let stateJson = {}
    if (rows[0]?.json) {
      const raw = rows[0].json
      try {
        stateJson = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch {
        stateJson = {}
      }
    }
    if (!stateJson || typeof stateJson !== 'object') stateJson = {}
    stateJson = mergeFacultyMirrorsIntoAppStateJson(stateJson, pgFacultyMirrors)
    stateJson = mergeCurriculumMirrorsIntoAppStateJson(stateJson, pgCurriculumMirrors)
    stateJson = mergeSectionMirrorsIntoAppStateJson(stateJson, pgSectionMirrors)
    return [
      {
        id: String(rows?.[0]?.id || STATE_ID),
        json: stateJson,
        updated_at: rows?.[0] ? rowToJson(rows[0]).updated_at : new Date().toISOString(),
      },
    ]
  } catch (e) {
    console.warn('[BACKUP] app_state export failed; using PG mirrors only:', e?.message || e)
    if (!pgFacultyMirrors.length && !pgCurriculumMirrors.length && !pgSectionMirrors.length) {
      return []
    }
    let stateJson = {}
    stateJson = mergeFacultyMirrorsIntoAppStateJson(stateJson, pgFacultyMirrors)
    stateJson = mergeCurriculumMirrorsIntoAppStateJson(stateJson, pgCurriculumMirrors)
    stateJson = mergeSectionMirrorsIntoAppStateJson(stateJson, pgSectionMirrors)
    return [
      {
        id: STATE_ID,
        json: stateJson,
        updated_at: new Date().toISOString(),
      },
    ]
  }
}

/**
 * Restore institute app_state JSON; backfill public.faculties from state.faculties when PG roster is empty.
 */
export async function restoreAppStateFromParsed(parsed, pool = getPgPool()) {
  const empty = {
    restored: false,
    synced_faculties: 0,
    synced_sections: 0,
    synced_curriculums: 0,
  }
  const rows = parsed?.data?.app_state
  if (!Array.isArray(rows) || rows.length === 0) return empty

  const row = rows[0]
  let stateJson = row.json
  if (typeof stateJson === 'string') {
    try {
      stateJson = JSON.parse(stateJson)
    } catch {
      console.warn('[BACKUP] app_state JSON could not be parsed; skipping app_state restore')
      return empty
    }
  }
  if (!stateJson || typeof stateJson !== 'object') return empty

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `
        INSERT INTO app_state (id, json, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (id) DO UPDATE SET json = EXCLUDED.json, updated_at = NOW()
      `,
      [String(row.id || STATE_ID), JSON.stringify(stateJson)],
    )

    const mirrorCounts = await syncAppStateMirrorsAfterRestore(client, stateJson)

    await client.query('COMMIT')
    return {
      restored: true,
      synced_faculties: mirrorCounts.synced_faculties,
      synced_sections: mirrorCounts.synced_sections,
      synced_curriculums: mirrorCounts.synced_curriculums,
    }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function warnOrphanFacultyRefsOnExport(pool) {
  const checks = [
    {
      label: 'subjects',
      sql: `
        SELECT DISTINCT s.faculty_id::text AS fid
        FROM public.subjects s
        WHERE s.faculty_id IS NOT NULL AND trim(coalesce(s.faculty_id::text, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM public.faculties f WHERE f.id::text = s.faculty_id::text
          )
      `,
    },
    {
      label: 'assignments',
      sql: `
        SELECT DISTINCT a.faculty_id::text AS fid
        FROM public.assignments a
        WHERE trim(coalesce(a.faculty_id::text, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM public.faculties f WHERE f.id::text = a.faculty_id::text
          )
      `,
    },
    {
      label: 'activities',
      sql: `
        SELECT DISTINCT a.faculty_id::text AS fid
        FROM public.activities a
        WHERE trim(coalesce(a.faculty_id::text, '')) <> ''
          AND NOT EXISTS (
            SELECT 1 FROM public.faculties f WHERE f.id::text = a.faculty_id::text
          )
      `,
    },
    {
      label: 'assignment_submissions',
      sql: `
        SELECT DISTINCT s.assignment_id::text AS ref_id
        FROM public.assignment_submissions s
        WHERE NOT EXISTS (
          SELECT 1 FROM public.assignments a WHERE a.id = s.assignment_id
        )
      `,
    },
    {
      label: 'activity_submissions',
      sql: `
        SELECT DISTINCT s.activity_id::text AS ref_id
        FROM public.activity_submissions s
        WHERE NOT EXISTS (
          SELECT 1 FROM public.activities a WHERE a.id = s.activity_id
        )
      `,
    },
  ]

  for (const { label, sql } of checks) {
    try {
      const { rows } = await pool.query(sql)
      if (rows.length > 0) {
        const ids = rows.map((r) => r.fid ?? r.ref_id).filter(Boolean).join(', ')
        const msg =
          label === 'assignment_submissions' || label === 'activity_submissions'
            ? `${rows.length} ${label} row(s) reference missing parent (ids: ${ids})`
            : `${rows.length} ${label} row(s) reference faculty missing from public.faculties (ids: ${ids})`
        console.warn(`[BACKUP] ${msg}`)
      }
    } catch {
      /* table may not exist yet */
    }
  }
}

export function computeBackupHmac(meta, data) {
  const secret = String(process.env.BETTER_AUTH_SECRET || '').trim()
  if (!secret) throw new Error('BETTER_AUTH_SECRET is not configured.')
  const metaCopy = { ...meta }
  delete metaCopy.hmac
  const payload = JSON.stringify({ meta: metaCopy, data })
  return createHmac('sha256', secret).update(payload).digest('hex')
}

export function verifyBackupHmac(parsed) {
  const stored = String(parsed?.meta?.hmac || '').trim()
  const metaWithoutHmac = { ...(parsed.meta || {}) }
  delete metaWithoutHmac.hmac
  const expected = computeBackupHmac(metaWithoutHmac, parsed.data || {})
  const a = Buffer.from(expected, 'hex')
  const b = Buffer.from(stored, 'hex')
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error('File integrity check failed. The backup may have been tampered with.')
  }
}

export async function countActiveFaculties(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.faculties WHERE archived_at IS NULL`,
    )
    return Number(rows[0]?.c || 0)
  } catch {
    return 0
  }
}

export async function countCurriculumRows(pool) {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM public.curriculum`)
    return Number(rows[0]?.c || 0)
  } catch {
    return 0
  }
}

export async function countActiveStudents(pool) {
  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*)::int AS c FROM public.students WHERE archived_at IS NULL`,
    )
    return Number(rows[0]?.c || 0)
  } catch {
    try {
      const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM public.students`)
      return Number(rows[0]?.c || 0)
    } catch {
      return 0
    }
  }
}

export async function countSectionsRows(pool) {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM public.sections`)
    return Number(rows[0]?.c || 0)
  } catch {
    return 0
  }
}

export async function countSubjectsRows(pool) {
  try {
    const { rows } = await pool.query(`SELECT COUNT(*)::int AS c FROM public.subjects`)
    return Number(rows[0]?.c || 0)
  } catch {
    return 0
  }
}

function countSectionsInAppStateSnapshot(appStateRows) {
  if (!Array.isArray(appStateRows) || !appStateRows[0]) return 0
  let json = appStateRows[0].json
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json)
    } catch {
      return 0
    }
  }
  return Array.isArray(json?.sections) ? json.sections.length : 0
}

function countCurriculumsInAppStateSnapshot(appStateRows) {
  if (!Array.isArray(appStateRows) || !appStateRows[0]) return 0
  let json = appStateRows[0].json
  if (typeof json === 'string') {
    try {
      json = JSON.parse(json)
    } catch {
      return 0
    }
  }
  return Array.isArray(json?.curriculums) ? json.curriculums.length : 0
}

async function walkDirForManifest(rootDir, pathPrefix) {
  const files = []
  const files_by_category = {}
  let total_bytes = 0

  async function walk(dir, relPrefix) {
    let entries
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const ent of entries) {
      const rel = relPrefix ? `${relPrefix}/${ent.name}` : ent.name
      const abs = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        await walk(abs, rel)
      } else if (ent.isFile()) {
        const st = await fsp.stat(abs)
        const hash = createHash('sha256')
        hash.update(await fsp.readFile(abs))
        const storedPath = pathPrefix ? `${pathPrefix}/${rel}` : rel
        files.push({
          path: storedPath,
          size_bytes: st.size,
          sha256: hash.digest('hex'),
        })
        total_bytes += st.size
        const cat = storedPath.split('/')[0] || 'root'
        files_by_category[cat] = (files_by_category[cat] || 0) + 1
      }
    }
  }

  await walk(rootDir, '')
  return { files, files_by_category, total_bytes, files_backed_up: files.length }
}

export async function buildBackupManifest({ row_counts, metaBase, uploadsDir = UPLOADS_DIR, assetsDir = SUBJECT_ASSETS_DIR }) {
  const uploads = await walkDirForManifest(uploadsDir, 'uploads')
  let assets = { files: [], files_by_category: {}, total_bytes: 0, files_backed_up: 0 }
  try {
    const st = await fsp.stat(assetsDir)
    if (st.isDirectory()) {
      assets = await walkDirForManifest(assetsDir, 'assets/subjects')
    }
  } catch {
    /* optional assets dir */
  }

  const files_by_category = { ...uploads.files_by_category }
  for (const [k, v] of Object.entries(assets.files_by_category)) {
    files_by_category[k] = (files_by_category[k] || 0) + v
  }

  return {
    manifest_version: 1,
    created_at: metaBase.created_at,
    schema_version: metaBase.schema_version,
    files_backed_up: uploads.files_backed_up + assets.files_backed_up,
    uploads_size_bytes: uploads.total_bytes + assets.total_bytes,
    files_by_category,
    row_counts,
    files: [...uploads.files, ...assets.files],
  }
}

const DB_FILE_PATH_FIELDS = [
  'photo_url',
  'file_path',
  'file_url',
  'submission_file',
  'announcement_image',
  'image_path',
  'syllabus_pdf',
  'pdf_path',
  'lesson_pdf',
  'attachment_path',
]

function collectDbFilePaths(parsed, limit = 50) {
  const paths = new Set()
  for (const key of LNBAK_TABLE_ORDER) {
    const rows = parsed?.data?.[key]
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      for (const field of DB_FILE_PATH_FIELDS) {
        const val = String(row?.[field] || '').trim()
        if (!val || val.startsWith('data:') || val.startsWith('http')) continue
        if (val.startsWith('/uploads/') || val.startsWith('uploads/')) {
          paths.add(val.startsWith('/') ? val : `/${val}`)
        }
      }
      if (paths.size >= limit) return [...paths]
    }
  }
  return [...paths]
}

export async function verifyRestoredFiles(parsed, manifest = null) {
  const samplePaths = collectDbFilePaths(parsed, 50)
  const missing = []
  let verified = 0
  for (const storedPath of samplePaths) {
    const resolved = resolvePublicUploadPath(storedPath)
    if (!resolved) continue
    try {
      await fsp.access(resolved, fs.constants.F_OK)
      verified++
    } catch {
      missing.push(storedPath)
    }
  }

  const warnings = []
  if (manifest?.files_backed_up != null) {
    const expected = Number(manifest.files_backed_up)
    const actual = Number(manifest.files?.length ?? expected)
    if (expected > 0 && actual !== expected) {
      warnings.push(`Manifest file count mismatch: expected ${expected}, listed ${actual}`)
    }
  } else if (parsed?.meta?.files_backed_up != null) {
    warnings.push('Backup manifest missing — file count verification skipped')
  }

  return {
    verified,
    missing,
    sample_checked: samplePaths.length,
    warnings,
    ok: missing.length === 0,
  }
}

export async function exportBackupData(pool, { createdBy = null } = {}) {
  const data = {}
  const row_counts = {}
  const export_warnings = []

  for (const key of LNBAK_TABLE_ORDER) {
    if (!(await tableExists(pool, key))) {
      data[key] = []
      row_counts[key] = 0
      continue
    }
    try {
      const { rows } = await pool.query(TABLE_SELECT_SQL[key])
      data[key] = (rows || []).map(rowToJson)
      row_counts[key] = data[key].length
    } catch (e) {
      console.error(`[BACKUP] export failed for table "${key}":`, e?.message || e)
      data[key] = []
      row_counts[key] = 0
    }
  }

  await warnOrphanFacultyRefsOnExport(pool)

  const activeFacultyCount = await countActiveFaculties(pool)
  if (activeFacultyCount > 0 && (!Array.isArray(data.faculties) || data.faculties.length === 0)) {
    const msg =
      'Backup export failed: active faculty exist in PostgreSQL but the faculties table exported 0 rows. Check server logs and database permissions.'
    export_warnings.push(msg)
    console.error(`[BACKUP] ${msg}`)
    throw new Error(msg)
  }

  data.app_state = await exportAppStateSnapshot(pool)
  row_counts.app_state = data.app_state.length

  const pgCurriculumCount = await countCurriculumRows(pool)
  const exportedCurriculumCount = Array.isArray(data.curriculum) ? data.curriculum.length : 0
  const snapshotCurriculumCount = countCurriculumsInAppStateSnapshot(data.app_state)
  if (pgCurriculumCount > 0 && exportedCurriculumCount === 0) {
    const msg =
      'Backup export warning: public.curriculum has rows but data.curriculum exported 0 rows — app_state snapshot may still include curriculum guides.'
    export_warnings.push(msg)
    console.error(`[BACKUP] ${msg}`)
  }
  if (pgCurriculumCount > 0 && snapshotCurriculumCount === 0) {
    const msg =
      'Backup export warning: public.curriculum has rows but app_state.curriculums is empty after enrichment.'
    export_warnings.push(msg)
    console.error(`[BACKUP] ${msg}`)
  }

  const activeStudentCount = await countActiveStudents(pool)
  if (activeStudentCount > 0 && (!Array.isArray(data.students) || data.students.length === 0)) {
    const msg =
      'Backup export failed: active students exist in PostgreSQL but the students table exported 0 rows. Check server logs and database permissions.'
    export_warnings.push(msg)
    console.error(`[BACKUP] ${msg}`)
    throw new Error(msg)
  }

  const rosterChecks = [
    { key: 'sections', countFn: countSectionsRows, snapshotCount: countSectionsInAppStateSnapshot(data.app_state) },
    { key: 'subjects', countFn: countSubjectsRows, snapshotCount: null },
    { key: 'user', countFn: async (p) => {
      try {
        const { rows } = await p.query(`SELECT COUNT(*)::int AS c FROM "user"`)
        return Number(rows[0]?.c || 0)
      } catch {
        return 0
      }
    }, snapshotCount: null },
  ]

  for (const { key, countFn, snapshotCount } of rosterChecks) {
    const pgCount = await countFn(pool)
    const exportedCount = Array.isArray(data[key]) ? data[key].length : 0
    if (pgCount > 0 && exportedCount === 0) {
      const msg = `Backup export warning: PostgreSQL has ${pgCount} ${key} row(s) but data.${key} exported 0 rows.`
      export_warnings.push(msg)
      console.error(`[BACKUP] ${msg}`)
    }
    if (key === 'sections' && pgCount > 0 && snapshotCount === 0) {
      const msg =
        'Backup export warning: public.sections has rows but app_state.sections is empty after enrichment.'
      export_warnings.push(msg)
      console.error(`[BACKUP] ${msg}`)
    }
  }

  const teacherUserCount = (data.user || []).filter(
    (u) => String(u.role || '').trim().toLowerCase() === 'teacher',
  ).length
  const facultyExported = Array.isArray(data.faculties) ? data.faculties.length : 0
  if (facultyExported > 0 && teacherUserCount === 0) {
    const msg =
      'Backup export warning: faculties exported but no teacher auth users in backup — faculty login may need repair after restore.'
    export_warnings.push(msg)
    console.error(`[BACKUP] ${msg}`)
  }

  const metaBase = {
    app: 'lenlearn',
    version: '1',
    created_at: new Date().toISOString(),
    created_by: createdBy ? String(createdBy) : null,
    schema_version: getLatestMigrationFilename(),
    table_count: LNBAK_TABLE_ORDER.length,
    row_counts,
    ...(export_warnings.length ? { export_warnings } : {}),
  }

  const manifest = await buildBackupManifest({ row_counts, metaBase })
  const meta = {
    ...metaBase,
    files_backed_up: manifest.files_backed_up,
    uploads_size_bytes: manifest.uploads_size_bytes,
    manifest_version: 1,
  }

  const hmac = computeBackupHmac(meta, data)
  return { meta: { ...meta, hmac }, data, manifest }
}

function appendDirTarGz(archive, dirPath, tarName) {
  const tar = archiver('tar', { gzip: true, gzipOptions: { level: 9 } })
  archive.append(tar, { name: tarName })

  return fsp
    .stat(dirPath)
    .then((st) => {
      if (st.isDirectory()) tar.directory(dirPath, false)
    })
    .catch(() => {
      /* empty tar.gz */
    })
    .then(() => tar.finalize())
}

function appendUploadsTarGz(archive, uploadsDir) {
  return appendDirTarGz(archive, uploadsDir, 'uploads_archive.tar.gz')
}

function appendSubjectAssetsTarGz(archive, assetsDir) {
  return appendDirTarGz(archive, assetsDir, 'subject_assets_archive.tar.gz')
}

function teeStream(source, destinations) {
  source.on('data', (chunk) => {
    for (const dest of destinations) {
      if (dest && !dest.destroyed && !dest.writableEnded) dest.write(chunk)
    }
  })
  source.on('end', () => {
    for (const dest of destinations) {
      if (dest && !dest.destroyed && !dest.writableEnded) dest.end()
    }
  })
  source.on('error', (err) => {
    for (const dest of destinations) {
      if (dest && !dest.destroyed) dest.destroy(err)
    }
  })
}

export function buildLnbakFilename(type = 'manual') {
  const dateStr = new Date().toISOString().slice(0, 10)
  return `backup_${type}_${dateStr}.lnbak`
}

export async function writeLnbakArchiveToPath({
  meta,
  data,
  diskPath,
  uploadsDir = UPLOADS_DIR,
  assetsDir = SUBJECT_ASSETS_DIR,
  manifest = null,
}) {
  ensureBackupsDirectory()
  await fsp.mkdir(path.dirname(diskPath), { recursive: true })

  const manifestPayload =
    manifest ||
    (await buildBackupManifest({
      row_counts: meta?.row_counts || {},
      metaBase: {
        created_at: meta?.created_at || new Date().toISOString(),
        schema_version: meta?.schema_version || getLatestMigrationFilename(),
      },
      uploadsDir,
      assetsDir,
    }))

  const dumpString = JSON.stringify({ meta, data })
  const archive = archiver('zip', { zlib: { level: 9 } })
  const fileStream = fs.createWriteStream(diskPath)
  const mux = new PassThrough()

  archive.pipe(mux)
  teeStream(mux, [fileStream])

  const done = new Promise((resolve, reject) => {
    fileStream.on('close', resolve)
    archive.on('error', reject)
    fileStream.on('error', reject)
    mux.on('error', reject)
  })

  archive.append(dumpString, { name: 'database_dump.json' })
  archive.append(JSON.stringify(manifestPayload), { name: 'backup_manifest.json' })
  await appendUploadsTarGz(archive, uploadsDir)
  await appendSubjectAssetsTarGz(archive, assetsDir)
  archive.finalize()
  await done

  const stats = await fsp.stat(diskPath)
  return {
    filePath: diskPath,
    sizeBytes: stats.size,
    sizeMb: Number((stats.size / (1024 * 1024)).toFixed(2)),
    files_backed_up: manifestPayload.files_backed_up,
    uploads_size_bytes: manifestPayload.uploads_size_bytes,
  }
}

export async function streamLnbakArchiveToResponse({
  meta,
  data,
  res,
  diskPath,
  uploadsDir = UPLOADS_DIR,
  assetsDir = SUBJECT_ASSETS_DIR,
  manifest = null,
}) {
  ensureBackupsDirectory()
  await fsp.mkdir(path.dirname(diskPath), { recursive: true })

  const manifestPayload =
    manifest ||
    (await buildBackupManifest({
      row_counts: meta?.row_counts || {},
      metaBase: {
        created_at: meta?.created_at || new Date().toISOString(),
        schema_version: meta?.schema_version || getLatestMigrationFilename(),
      },
      uploadsDir,
      assetsDir,
    }))

  const dumpString = JSON.stringify({ meta, data })
  const archive = archiver('zip', { zlib: { level: 9 } })
  const fileStream = fs.createWriteStream(diskPath)
  const mux = new PassThrough()

  archive.on('error', (err) => {
    if (!res.headersSent) {
      res.status(500).json({ message: 'Backup failed', error: err.message })
    }
  })

  archive.pipe(mux)
  teeStream(mux, [fileStream, res])

  const fileDone = finished(fileStream)
  archive.append(dumpString, { name: 'database_dump.json' })
  archive.append(JSON.stringify(manifestPayload), { name: 'backup_manifest.json' })
  await appendUploadsTarGz(archive, uploadsDir)
  await appendSubjectAssetsTarGz(archive, assetsDir)
  archive.finalize()

  await fileDone
  const stats = await fsp.stat(diskPath)
  return {
    filePath: diskPath,
    sizeBytes: stats.size,
    sizeMb: Number((stats.size / (1024 * 1024)).toFixed(2)),
    files_backed_up: manifestPayload.files_backed_up,
    uploads_size_bytes: manifestPayload.uploads_size_bytes,
  }
}

async function parseLnbakZip(zip, { uploadsToDisk = false, assetsToDisk = false } = {}) {
  const dumpEntry = zip.files.find((f) => f.path === 'database_dump.json')
  const uploadsEntry = zip.files.find((f) => f.path === 'uploads_archive.tar.gz')
  const manifestEntry = zip.files.find((f) => f.path === 'backup_manifest.json')
  const assetsEntry = zip.files.find((f) => f.path === 'subject_assets_archive.tar.gz')
  if (!dumpEntry || !uploadsEntry) {
    throw new Error('Invalid archive structure')
  }
  const dumpRaw = await dumpEntry.buffer()
  let parsed
  try {
    parsed = JSON.parse(dumpRaw.toString('utf8'))
  } catch {
    throw new Error('Invalid JSON in backup file')
  }

  let manifest = null
  if (manifestEntry) {
    try {
      manifest = JSON.parse((await manifestEntry.buffer()).toString('utf8'))
    } catch {
      manifest = null
    }
  }

  if (uploadsToDisk) {
    const uploadsPath = path.join(tmpdir(), `lnbak-uploads-${randomUUID()}.tar.gz`)
    await pipeline(uploadsEntry.stream(), fs.createWriteStream(uploadsPath))
    let subjectAssetsPath = null
    if (assetsEntry && assetsToDisk) {
      subjectAssetsPath = path.join(tmpdir(), `lnbak-assets-${randomUUID()}.tar.gz`)
      await pipeline(assetsEntry.stream(), fs.createWriteStream(subjectAssetsPath))
    }
    return { parsed, uploadsPath, uploadsBuffer: null, manifest, subjectAssetsPath, subjectAssetsBuffer: null }
  }

  const uploadsBuffer = await uploadsEntry.buffer()
  const subjectAssetsBuffer = assetsEntry ? await assetsEntry.buffer() : null
  return {
    parsed,
    uploadsBuffer,
    uploadsPath: null,
    manifest,
    subjectAssetsPath: null,
    subjectAssetsBuffer,
  }
}

export async function readLnbakBuffer(buffer) {
  const zip = await unzipper.Open.buffer(buffer)
  return parseLnbakZip(zip, { uploadsToDisk: false })
}

export async function readLnbakFromPath(filePath) {
  const zip = await unzipper.Open.file(filePath)
  return parseLnbakZip(zip, { uploadsToDisk: true })
}

export function validateLnbakParsed(parsed) {
  if (parsed?.meta?.app !== 'lenlearn') {
    throw new Error('File was not created by LenLearn')
  }
  if (!parsed?.meta?.version) {
    throw new Error('Missing version in backup metadata')
  }
  const latest = getLatestMigrationFilename()
  const backupVersion = String(parsed.meta.schema_version || 'unknown')
  if (compareMigrationFilename(backupVersion, latest) > 0) {
    throw new Error(
      `Schema version mismatch. Backup is from a newer LenLearn than this server. Server: ${latest} Backup: ${backupVersion}`,
    )
  }
  verifyBackupHmac(parsed)
  const dataKeys = Object.keys(parsed.data || {})
  const known = dataKeys.filter((k) => LNBAK_TABLE_ORDER.includes(k) || k === 'app_state')
  if (!parsed.data || known.filter((k) => LNBAK_TABLE_ORDER.includes(k)).length < MIN_RESTORE_TABLE_KEYS) {
    throw new Error('Backup data is incomplete')
  }
  warnOrphanFacultyRefsInParsed(parsed)
  const warnings = collectRestorePreflightWarnings(parsed)
  if (!parsed?.meta?.manifest_version) {
    warnings.push('Backup manifest missing — file integrity verification will be limited')
  }
  if (warnings.length) {
    parsed.meta = { ...(parsed.meta || {}), restore_warnings: warnings }
    for (const w of warnings) console.warn(`[BACKUP] ${w}`)
  }
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

function unionRowKeys(rows) {
  const keySet = new Set()
  for (const r of rows) {
    if (r && typeof r === 'object') {
      for (const k of Object.keys(r)) keySet.add(k)
    }
  }
  return [...keySet]
}

async function bulkInsert(client, tableKey, rows, pool = null) {
  if (!Array.isArray(rows) || rows.length === 0) return
  const fromSql = TABLE_FROM_SQL[tableKey]
  if (!fromSql) return

  let cols = unionRowKeys(rows)
  if (tableKey === 'faculties' && pool) {
    const colSet = await getFacultiesColumnSet(pool)
    cols = filterFacultyRowKeys(cols, colSet)
  }
  if (!cols.length) return

  const colCount = cols.length
  const colList = cols.map(quoteIdent).join(', ')
  const maxRowsPerBatch = Math.max(1, Math.floor(60000 / colCount))

  for (let offset = 0; offset < rows.length; offset += maxRowsPerBatch) {
    const batch = rows.slice(offset, offset + maxRowsPerBatch)
    const placeholders = batch
      .map(
        (_, i) =>
          `(${cols.map((_, j) => `$${i * colCount + j + 1}`).join(',')})`,
      )
      .join(',')
    const values = batch.flatMap((r) =>
      cols.map((c) => {
        const v = r[c]
        if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) {
          return JSON.stringify(v)
        }
        return v ?? null
      }),
    )
    await client.query(`INSERT INTO ${fromSql} (${colList}) VALUES ${placeholders}`, values)
  }
}

async function resetSerialSequences(client, pool) {
  for (const key of LNBAK_TABLE_ORDER) {
    if (!TABLES_WITH_SERIAL_ID.has(key)) continue
    const fromSql = TABLE_FROM_SQL[key]
    if (!fromSql || !(await tableExists(pool, key))) continue
    const bare = tableNameFromKey(key)
    if (!bare) continue
    try {
      await client.query(
        `SELECT setval(
          pg_get_serial_sequence('public.' || $1::text, 'id'),
          COALESCE((SELECT MAX(id) FROM ${fromSql}), 1),
          true
        )`,
        [bare],
      )
    } catch {
      /* table may lack serial id column */
    }
  }
}

export async function restoreDatabaseFromParsed(parsed) {
  const pool = getPgPool()
  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    for (const key of TRUNCATE_ORDER) {
      const fromSql = TABLE_FROM_SQL[key]
      if (!fromSql) continue
      if (!(await tableExists(pool, key))) continue
      await client.query(`TRUNCATE ${fromSql} CASCADE`)
    }

    for (const key of LNBAK_TABLE_ORDER) {
      const rows = parsed.data?.[key]
      if (!Array.isArray(rows) || rows.length === 0) continue
      if (!(await tableExists(pool, key))) continue
      if (shouldSkipRestoreTable(parsed, key)) {
        console.warn(`[BACKUP] Skipping ${key} restore — no parent rows in backup`)
        continue
      }
      const prepared = prepareRestoreRowsForInsert(parsed, key, rows)
      if (!prepared.length) continue
      await bulkInsert(client, key, prepared, pool)
    }

    await resetSerialSequences(client, pool)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function extractTarGzFromPath(tarGzPath, uploadsDir = UPLOADS_DIR) {
  await fsp.mkdir(uploadsDir, { recursive: true })
  return new Promise((resolve, reject) => {
    const child = spawn('tar', ['-xzf', tarGzPath, '-C', uploadsDir], { stdio: 'ignore' })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(true)
      else reject(new Error(`tar extract exited with code ${code}`))
    })
  })
}

async function extractTarGzToUploads(tarGzBuffer, uploadsDir = UPLOADS_DIR) {
  const tempFile = path.join(tmpdir(), `lnbak-uploads-${randomUUID()}.tar.gz`)
  await fsp.writeFile(tempFile, tarGzBuffer)
  try {
    await extractTarGzFromPath(tempFile, uploadsDir)
  } finally {
    await fsp.unlink(tempFile).catch(() => {})
  }
}

export async function extractSubjectAssetsArchive(assetsSource) {
  if (!assetsSource) return true
  try {
    if (typeof assetsSource === 'string' && assetsSource) {
      await extractTarGzFromPath(assetsSource, SUBJECT_ASSETS_DIR)
      await fsp.unlink(assetsSource).catch(() => {})
    } else if (Buffer.isBuffer(assetsSource)) {
      const tempFile = path.join(tmpdir(), `lnbak-assets-${randomUUID()}.tar.gz`)
      await fsp.writeFile(tempFile, assetsSource)
      try {
        await extractTarGzFromPath(tempFile, SUBJECT_ASSETS_DIR)
      } finally {
        await fsp.unlink(tempFile).catch(() => {})
      }
    }
    return true
  } catch (e) {
    console.warn('[BACKUP] Subject assets extraction failed:', e?.message || e)
    return false
  }
}

export async function extractUploadsArchive(uploadsSource) {
  try {
    if (typeof uploadsSource === 'string' && uploadsSource) {
      await extractTarGzFromPath(uploadsSource)
      await fsp.unlink(uploadsSource).catch(() => {})
    } else if (Buffer.isBuffer(uploadsSource)) {
      await extractTarGzToUploads(uploadsSource)
    }
    return true
  } catch (e) {
    console.warn('[BACKUP] Upload extraction failed (DB restore already committed):', e?.message || e)
    return false
  }
}

export async function insertRestoreAuditLog(parsed) {
  const pool = getPgPool()
  if (!(await tableExists(pool, 'audit_logs'))) return
  const sourceCreated = parsed?.meta?.created_at || 'unknown backup'
  await pool.query(
    `INSERT INTO public.audit_logs (type, payload, created_at)
     VALUES ($1, $2::jsonb, NOW())`,
    [
      'restore_completed',
      JSON.stringify({
        description: `Admin restored backup from ${sourceCreated}`,
        source_created_at: sourceCreated,
      }),
    ],
  )
}

export async function createSafetyBackup(createdBy) {
  const pool = getPgPool()
  const { meta, data, manifest } = await exportBackupData(pool, { createdBy })
  const ts = new Date().toISOString().replace(/[:.]/g, '-')
  const filename = `backup_pre_restore_${ts}.lnbak`
  const diskPath = path.join(BACKUPS_DIR, filename)
  await writeLnbakArchiveToPath({ meta, data, diskPath, manifest })
  return filename
}

export function buildRestoreSummary(parsed) {
  const tables_restored = []
  const row_counts = {}
  for (const key of LNBAK_TABLE_ORDER) {
    const rows = parsed.data?.[key]
    if (Array.isArray(rows) && rows.length > 0) {
      tables_restored.push(key)
      row_counts[key] = rows.length
    }
  }
  if (Array.isArray(parsed.data?.app_state) && parsed.data.app_state.length > 0) {
    tables_restored.push('app_state')
    row_counts.app_state = parsed.data.app_state.length
  }
  const restore_warnings = Array.isArray(parsed?.meta?.restore_warnings)
    ? parsed.meta.restore_warnings
    : collectRestorePreflightWarnings(parsed)
  return { tables_restored, row_counts, restore_warnings }
}

export async function buildInstituteRestoreReport(pool) {
  const facultyReport = await buildFacultyRestoreReport(pool)
  const safeCount = async (sql, params = []) => {
    try {
      const { rows } = await pool.query(sql, params)
      return Number(rows[0]?.c ?? rows[0]?.total ?? 0)
    } catch {
      return 0
    }
  }

  const [
    students_active,
    sections_count,
    subjects_count,
    curriculum_rows,
    student_users,
    admin_users,
    student_missing_auth_link,
  ] = await Promise.all([
    safeCount(`SELECT COUNT(*)::int AS c FROM public.students WHERE archived_at IS NULL`),
    safeCount(`SELECT COUNT(*)::int AS c FROM public.sections`),
    safeCount(`SELECT COUNT(*)::int AS c FROM public.subjects`),
    safeCount(`SELECT COUNT(*)::int AS c FROM public.curriculum`),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM "user" WHERE lower(trim(coalesce(role, ''))) = 'student'`,
    ),
    safeCount(`SELECT COUNT(*)::int AS c FROM "user" WHERE lower(trim(coalesce(role, ''))) = 'admin'`),
    safeCount(
      `SELECT COUNT(*)::int AS c FROM public.students
       WHERE archived_at IS NULL
         AND (auth_user_id IS NULL OR trim(coalesce(auth_user_id, '')) = '')`,
    ),
  ])

  return {
    ...facultyReport,
    students_active,
    sections_count,
    subjects_count,
    curriculum_rows,
    student_users,
    admin_users,
    student_missing_auth_link,
  }
}

/** Post-DB restore: files, app_state, auth link repair, audit log, summary. */
export async function completeRestoreAfterDatabase(parsed, uploadsSource, opts = {}) {
  let files_restored = opts.files_restored
  let assets_restored = opts.assets_restored
  if (!opts.skipFileExtract) {
    files_restored = await extractUploadsArchive(uploadsSource)
    assets_restored = await extractSubjectAssetsArchive(opts.subjectAssetsSource)
  }

  const manifest = opts.manifest || null
  const file_verification =
    opts.file_verification || (await verifyRestoredFiles(parsed, manifest))

  const app_state = await restoreAppStateFromParsed(parsed)
  const pool = getPgPool()
  const auth_repair = await repairFacultyAuthLinks(pool)
  const student_auth_repair = await repairStudentAuthLinks(pool)
  const instituteReport = await buildInstituteRestoreReport(pool)
  await insertRestoreAuditLog(parsed)
  const { tables_restored, row_counts, restore_warnings } = buildRestoreSummary(parsed)
  const mergedWarnings = [...restore_warnings]
  if (file_verification.warnings?.length) mergedWarnings.push(...file_verification.warnings)
  if (file_verification.missing?.length) {
    mergedWarnings.push(
      `${file_verification.missing.length} referenced file(s) missing after restore (sample check)`,
    )
  }
  const curriculumRowCount = Number(row_counts?.curriculum ?? parsed.data?.curriculum?.length ?? 0)
  const curriculumsInSnapshot = countCurriculumsInAppStateSnapshot(parsed.data?.app_state)
  const sectionsInSnapshot = countSectionsInAppStateSnapshot(parsed.data?.app_state)

  return {
    files_restored,
    assets_restored,
    file_verification,
    files_restored_count: manifest?.files_backed_up ?? parsed?.meta?.files_backed_up ?? null,
    app_state,
    auth_repair,
    student_auth_repair,
    faculties_restored: instituteReport.faculties_active,
    teacher_users_restored: instituteReport.teacher_users_restored,
    faculty_missing_auth_link: instituteReport.faculty_missing_auth_link,
    students_restored: instituteReport.students_active,
    sections_restored: instituteReport.sections_count,
    subjects_restored: instituteReport.subjects_count,
    curriculum_rows_restored: curriculumRowCount,
    curriculums_in_app_state: curriculumsInSnapshot,
    curriculums_synced: Number(app_state?.synced_curriculums ?? 0),
    sections_in_app_state: sectionsInSnapshot,
    sections_synced: Number(app_state?.synced_sections ?? 0),
    student_users_restored: instituteReport.student_users,
    admin_users_restored: instituteReport.admin_users,
    student_missing_auth_link: instituteReport.student_missing_auth_link,
    tables_restored,
    row_counts,
    restore_warnings: mergedWarnings,
  }
}

/**
 * Orchestrated restore with optional progress callbacks.
 * @param {(event: { step: number, message?: string, detail?: string }) => void} [onProgress]
 */
export async function runRestorePipeline({
  parsed,
  uploadsSource,
  subjectAssetsSource = null,
  manifest = null,
  createdBy = null,
  createSafety = true,
  onProgress,
}) {
  const emit = (step, extra = {}) => {
    if (onProgress) onProgress({ step, ...extra })
  }

  emit(0, { message: 'Validating backup file' })
  validateLnbakParsed(parsed)

  let safetyBackup = null
  if (createSafety) {
    emit(1, { message: 'Creating safety snapshot' })
    safetyBackup = await createSafetyBackup(createdBy)
  }

  const tablesCount = LNBAK_TABLE_ORDER.filter((k) => {
    const rows = parsed.data?.[k]
    return Array.isArray(rows) && rows.length > 0
  }).length
  emit(2, { message: 'Restoring database', detail: `${tablesCount} tables` })

  try {
    await restoreDatabaseFromParsed(parsed)
  } catch (e) {
    throw e
  }

  const filesExpected = manifest?.files_backed_up ?? parsed?.meta?.files_backed_up ?? null
  emit(3, {
    message: 'Restoring uploaded files',
    detail: filesExpected != null ? `${filesExpected} files` : undefined,
  })
  const files_restored = await extractUploadsArchive(uploadsSource)
  const assets_restored = await extractSubjectAssetsArchive(subjectAssetsSource)

  emit(4, { message: 'Verifying file integrity' })
  const file_verification = await verifyRestoredFiles(parsed, manifest)

  emit(5, { message: 'Complete' })
  const restoreDetails = await completeRestoreAfterDatabase(parsed, uploadsSource, {
    skipFileExtract: true,
    files_restored,
    assets_restored,
    manifest,
    file_verification,
  })

  return { safety_backup: safetyBackup, ...restoreDetails }
}
