import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const srcPath = path.join(root, 'server/api/state.js')
const outDir = path.join(root, 'server/api/state')
const lines = fs.readFileSync(srcPath, 'utf8').split(/\r?\n/)

fs.mkdirSync(outDir, { recursive: true })

const sharedHeader = `/**
 * Shared institute state API helpers (extracted from legacy state.js).
 */
`

const sharedBody = lines.slice(0, 1409).join('\n')
const sharedExports = `
export {
  STATE_ID,
  requireAdminSession,
  logStatePostgresError,
  auditInstituteRecord,
  ensureSchema,
  ensureRecordIntegrityColumns,
  getFacultiesColumnSet,
  facultiesColumnSetCache,
  backfillMirrorTables,
  noopClose,
  parseArchiveEntityType,
  archiveStudentRecord,
  archiveFacultyRecord,
  obfuscateArchivedStudentForVault,
  obfuscateArchivedFacultyForVault,
  handleArchiveFaculty,
  handleArchiveStudent,
  listActiveFaculty,
  FACULTIES_FROM,
}
`

// Export all async function declarations from shared
const sharedPath = path.join(outDir, 'shared.js')
fs.writeFileSync(
  sharedPath,
  `${sharedHeader}${sharedBody}\n\n// Re-export key symbols for sub-routers\n${sharedExports}`,
)

function wrapRouter(name, startLine, endLine, extraImports = '') {
  const body = lines.slice(startLine - 1, endLine).join('\n')
  return `import {
  requireAdminSession,
  logStatePostgresError,
  sendSafeServerError,
  auditInstituteRecord,
  ${extraImports}
} from './shared.js'
import { sendSafeServerError as safeErr } from '../../lib/safeApiError.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function register${name}Routes(router, { pool, auth }) {
${body.split('\n').map((l) => (l.startsWith('  router.') ? l : l.startsWith('  async function') || l.startsWith('  function') || l.startsWith('  const handle') ? '  ' + l : l.startsWith('  router') ? l : '  ' + l)).join('\n')}
}
`
}

// Fix: routes already have 2-space indent with router. - need to paste as-is inside function
function wrapRouterSimple(name, startLine, endLine) {
  const body = lines.slice(startLine - 1, endLine).join('\n')
  return `import * as shared from './shared.js.js'
import { sendSafeServerError } from '../../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest, requireDestructiveConfirm } from '../../lib/security.js'
import { facultyPhotoUploadMiddleware, getFacultyUploadFile, normalizeFacultyMultipartBody } from '../../lib/facultyMultipart.js'
import { resolveFacultyPhotoForDb } from '../../lib/facultyPhotoStorage.js'
import { resolveSubjectImagePath } from '../../lib/subjectImageStorage.js'
import { announcementRowToResponse, ensureAnnouncementsMetadataColumns, maybeDeleteOldAnnouncementFile, readAnnouncementBodyFields, resolveAnnouncementImageForSave, resolveSessionUploadedByLabel } from '../../lib/announcementsDb.js'
import { ARCHIVE_ENTITY_TYPES, assertSqlIdentifier, filterFacultyRowKeys, resolveArchiveTableSql } from '../../lib/sqlGuards.js'
import { validateProfilePhotoPayload } from '../../../shared/uploadLimits.js'
import { extendUpdateSetWithIntegrity, stampRowLastModified } from '../../lib/recordIntegrity.js'
import { findAuthUserIdByEmail } from '../logs.js'
import bcrypt from 'bcrypt'

const {
  requireAdminSession,
  logStatePostgresError,
  auditInstituteRecord,
  parseArchiveEntityType,
  archiveStudentRecord,
  archiveFacultyRecord,
  obfuscateArchivedStudentForVault,
  obfuscateArchivedFacultyForVault,
  handleArchiveFaculty,
  handleArchiveStudent,
  listActiveFaculty,
  getFacultiesColumnSet,
  FACULTIES_FROM,
  purgeFacultyFromAppStateJson,
} = shared

export function register${name}Routes(router, { pool, auth }) {
${body}
}
`
}

// Too complex - use minimal imports per file manually

const routers = [
  ['Curriculum', 1674, 1865],
  ['Subjects', 1866, 2027],
  ['Announcements', 2028, 2219],
  ['Faculty', 2220, 2585],
  ['Students', 2586, 3003],
  ['Archive', 3005, 3177],
]

for (const [name, start, end] of routers) {
  const body = lines.slice(start - 1, end).join('\n')
  const content = `import * as S from './shared.js'

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function register${name}Routes(router, { pool, auth }) {
${body}
}
`
  fs.writeFileSync(path.join(outDir, `${name.charAt(0).toLowerCase() + name.slice(1)}Router.js`), content)
}

const stateBody = lines.slice(1609, 1673).join('\n')
fs.writeFileSync(
  path.join(outDir, 'stateRoutes.js'),
  `import * as S from './shared.js'

export function registerStateRoutes(router, { pool }) {
${stateBody}
}
`,
)

console.log('Wrote shared.js and router stubs')
