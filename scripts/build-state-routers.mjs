import fs from 'node:fs'
import path from 'node:path'

const root = path.join(import.meta.dirname, '..')
const lines = fs.readFileSync(path.join(root, 'server/api/state.js'), 'utf8').split(/\r?\n/)
const outDir = path.join(root, 'server/api/state')

const routers = [
  [
    'stateRoutes.js',
    'State',
    1610,
    1673,
    `import { logStatePostgresError, STATE_ID } from './shared.js'
import { sendSafeServerError } from '../../lib/safeApiError.js'`,
  ],
  [
    'curriculumRouter.js',
    'Curriculum',
    1674,
    1865,
    `import { requireAdminSession, logStatePostgresError, auditInstituteRecord } from './shared.js'
import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'`,
  ],
  [
    'subjectsRouter.js',
    'Subjects',
    1866,
    2027,
    `import { requireAdminSession, logStatePostgresError, subjectPgError, subjectRowToResponse, readSubjectBodyFields, readSubjectSyllabus, normalizeSubjectSemester } from './shared.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { resolveSubjectImagePath } from '../../lib/subjectImageStorage.js'
import { extendUpdateSetWithIntegrity, stampRowLastModified } from '../../lib/recordIntegrity.js'`,
  ],
  [
    'announcementsRouter.js',
    'Announcements',
    2028,
    2219,
    `import { requireAdminSession, logStatePostgresError, announcementPgError } from './shared.js'
import { announcementRowToResponse, ensureAnnouncementsMetadataColumns, maybeDeleteOldAnnouncementFile, readAnnouncementBodyFields, resolveAnnouncementImageForSave, resolveSessionUploadedByLabel } from '../../lib/announcementsDb.js'
import { GENERIC_SERVER_ERROR } from '../../lib/safeApiError.js'`,
  ],
  [
    'facultyRouter.js',
    'Faculty',
    2220,
    2585,
    `import { requireAdminSession, logStatePostgresError, auditInstituteRecord, readStudentField, parseFacultySectionIds, mapBodyToFacultiesRow, insertFacultiesRow, updateFacultyWithSections, getFacultiesColumnSet, facultyRowToResponse, FACULTIES_FROM, listActiveFaculty, handleArchiveFaculty, readFacultyPhotoUrl, hashFacultyPassword, buildFacultyAuditTargetName, computeFacultyProfileDetailedDiffs, fetchFacultyPriorState, buildFacultyComparePayload } from './shared.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { facultyPhotoUploadMiddleware, normalizeFacultyMultipartBody } from '../../lib/facultyMultipart.js'
import { resolveFacultyPhotoForDb } from '../../lib/facultyPhotoStorage.js'
import { findAuthUserIdByEmail } from '../logs.js'
import { validateProfilePhotoPayload } from '../../../shared/uploadLimits.js'`,
  ],
  [
    'studentsRouter.js',
    'Students',
    2586,
    3003,
    `import { requireAdminSession, logStatePostgresError, auditInstituteRecord, readStudentField, readStudentOptional, parseStudentDob, readStudentContact, readStudentParentContact, readStudentAppPassword, readStudentPhotoUrl, parseStudentSectionId, normStr, omitStudentPassword, hashStudentPassword, handleArchiveStudent, buildStudentAuditTargetName, computeStudentProfileDetailedDiffs } from './shared.js'
import { GENERIC_SERVER_ERROR, sendSafeServerError } from '../../lib/safeApiError.js'
import { findAuthUserIdByEmail } from '../logs.js'`,
  ],
  [
    'archiveRouter.js',
    'Archive',
    3005,
    3177,
    `import { requireAdminSession, logStatePostgresError, parseArchiveEntityType, obfuscateArchivedStudentForVault, obfuscateArchivedFacultyForVault, getFacultiesColumnSet, FACULTIES_FROM, purgeFacultyFromAppStateJson } from './shared.js'
import { sendSafeServerError } from '../../lib/safeApiError.js'
import { requireDestructiveConfirm } from '../../lib/security.js'
import { resolveArchiveTableSql } from '../../lib/sqlGuards.js'`,
  ],
]

for (const [file, name, start, end, imports] of routers) {
  const body = lines.slice(start - 1, end).join('\n')
  const content = `${imports}

/** @param {import('express').Router} router @param {{ pool: import('pg').Pool, auth: object }} ctx */
export function register${name}Routes(router, ctx) {
  const { pool, auth } = ctx
${body}
}
`
  fs.writeFileSync(path.join(outDir, file), content)
}

console.log('routers ok')
