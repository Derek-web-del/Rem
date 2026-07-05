import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import '../server/env-bootstrap.js'
import {
  LNBAK_TABLE_ORDER,
  RESTORE_ENGINE_VERSION,
  BACKUP_TABLE_EXCLUDE,
  computeBackupHmac,
  validateLnbakParsed,
  exportBackupData,
  getLatestMigrationFilename,
  buildFacultyIdSet,
  buildSectionIdSet,
  sanitizeFacultyFkRows,
  sanitizeFacultySectionRows,
  sanitizeChildFkRows,
  sanitizeOptionalTopicIdRows,
  omitRestoreInsertColumns,
  captureTopicLinkPlan,
  purgeTopicIdsFromBackupData,
  applyDeferredTopicIdsFromPlan,
  applyDeferredTopicIds,
  prepareRestoreRowsForInsert,
  buildNumericIdSetFromRows,
  idInNumericSet,
  collectRestorePreflightWarnings,
  countSectionsRows,
  discoverBackupTables,
  resolveBackupTableOrder,
  beginRestoreSession,
  endRestoreSession,
  parsePostgresRestoreError,
  enrichRestoreError,
  RestoreFailedError,
} from '../server/lib/lnbakEngine.js'
import { formatRestoreErrorPayload } from '../server/lib/safeApiError.js'
import { BETTER_AUTH_SECRET_FOR_TESTS } from './load-test-env.js'
import {
  facultyPgRowToAppStateMirror,
  mergeFacultyMirrorsIntoAppStateJson,
  curriculumPgRowToAppStateMirror,
  mergeCurriculumMirrorsIntoAppStateJson,
  sectionPgRowToAppStateMirror,
  mergeSectionMirrorsIntoAppStateJson,
} from '../server/api/state/shared.js'
import { exportAppStateSnapshot, countCurriculumRows } from '../server/lib/lnbakEngine.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const dbDescribe = PG_TEST_URL ? describe : describe.skip

function buildValidParsed(overrides = {}) {
  const latest = getLatestMigrationFilename()
  const data = {
    user: [],
    account: [],
    curriculum: [],
    sections: [],
    faculties: [],
    subjects: [],
    ...(overrides.data || {}),
  }
  const meta = {
    app: 'lenlearn',
    version: '1',
    schema_version: latest,
    ...(overrides.meta || {}),
  }
  const hmac = computeBackupHmac(meta, data)
  return { meta: { ...meta, hmac }, data }
}

describe('lnbak validateLnbakParsed schema policy', () => {
  test('allows backup from older migration than server', () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const parsed = buildValidParsed({ meta: { schema_version: '001_sections_catalog_postgres.sql' } })
    assert.doesNotThrow(() => validateLnbakParsed(parsed))
  })

  test('rejects backup from newer migration than server', () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const parsed = buildValidParsed({ meta: { schema_version: 'zzz_future_migration.sql' } })
    assert.throws(
      () => validateLnbakParsed(parsed),
      /newer LenLearn/,
    )
  })
})

describe('lnbak FK sanitization on restore', () => {
  test('sanitizeFacultyFkRows clears orphan faculty_id when allowNull', () => {
    const facultyIds = new Set(['f1'])
    const { rows, nulled, skipped } = sanitizeFacultyFkRows(
      [
        { id: 1, faculty_id: 'f1', subject_code: 'A' },
        { id: 2, faculty_id: 'missing', subject_code: 'B' },
      ],
      facultyIds,
      { allowNull: true },
    )
    assert.equal(nulled, 1)
    assert.equal(skipped, 0)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].faculty_id, 'f1')
    assert.equal(rows[1].faculty_id, null)
  })

  test('sanitizeFacultyFkRows skips rows when faculty_id required', () => {
    const facultyIds = new Set(['f1'])
    const { rows, skipped } = sanitizeFacultyFkRows(
      [
        { id: 1, faculty_id: 'f1', title: 'Ok' },
        { id: 2, faculty_id: 'ghost', title: 'Bad' },
      ],
      facultyIds,
      { allowNull: false },
    )
    assert.equal(skipped, 1)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].faculty_id, 'f1')
  })

  test('sanitizeFacultySectionRows drops invalid faculty_id or section_id', () => {
    const facultyIds = new Set(['f1'])
    const sectionIds = new Set(['10'])
    const { rows, skipped } = sanitizeFacultySectionRows(
      [
        { faculty_id: 'f1', section_id: 10 },
        { faculty_id: 'f1', section_id: 99 },
        { faculty_id: 'ghost', section_id: 10 },
      ],
      facultyIds,
      sectionIds,
    )
    assert.equal(skipped, 2)
    assert.equal(rows.length, 1)
    assert.deepEqual(rows[0], { faculty_id: 'f1', section_id: 10 })
  })

  test('sanitizeChildFkRows skips orphan assignment_id', () => {
    const assignmentIds = buildNumericIdSetFromRows([{ id: 10 }])
    const { rows, skipped } = sanitizeChildFkRows(
      [
        { id: 1, assignment_id: 10, student_id: 5 },
        { id: 2, assignment_id: 99, student_id: 5 },
      ],
      assignmentIds,
      { parentColumn: 'assignment_id', optionalColumn: 'student_id', optionalIds: new Set(['5']) },
    )
    assert.equal(skipped, 1)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].assignment_id, 10)
    assert.ok(idInNumericSet(assignmentIds, 10))
  })

  test('prepareRestoreRowsForInsert skips assignment_submissions when assignment was dropped', () => {
    const parsed = {
      data: {
        faculties: [{ id: 'f1', name: 'A', email: 'a@test.com' }],
        assignments: [
          { id: 1, faculty_id: 'f1', title: 'Ok' },
          { id: 2, faculty_id: 'missing', title: 'Bad' },
        ],
        students: [{ id: 5 }],
        assignment_submissions: [
          { id: 100, assignment_id: 1, student_id: 5 },
          { id: 101, assignment_id: 2, student_id: 5 },
        ],
      },
    }
    const out = prepareRestoreRowsForInsert(parsed, 'assignment_submissions', parsed.data.assignment_submissions)
    assert.equal(out.length, 1)
    assert.equal(out[0].assignment_id, 1)
  })

  test('prepareRestoreRowsForInsert clears subjects orphan faculty_id', () => {
    const parsed = {
      data: {
        faculties: [{ id: 'f1' }],
        sections: [{ id: 10 }],
        subjects: [{ id: 1, faculty_id: 'orphan', subject_code: 'M1' }],
      },
    }
    const out = prepareRestoreRowsForInsert(parsed, 'subjects', parsed.data.subjects)
    assert.equal(out.length, 1)
    assert.equal(out[0].faculty_id, null)
    assert.ok(buildFacultyIdSet(parsed).has('f1'))
    assert.ok(buildSectionIdSet(parsed).has('10'))
  })

  test('sanitizeOptionalTopicIdRows clears orphan or sentinel topic_id', () => {
    const topicIds = buildNumericIdSetFromRows([{ id: 7 }])
    const { rows, nulled } = sanitizeOptionalTopicIdRows(
      [
        { id: 1, topic_id: 7 },
        { id: 2, topic_id: 99 },
        { id: 3, topic_id: 'uncategorized' },
      ],
      topicIds,
    )
    assert.equal(nulled, 2)
    assert.equal(rows.length, 3)
    assert.equal(rows[0].topic_id, 7)
    assert.equal(rows[1].topic_id, null)
    assert.equal(rows[2].topic_id, null)
  })

  test('prepareRestoreRowsForInsert clears subject_modules orphan topic_id', () => {
    const parsed = {
      data: {
        subjects: [{ id: 1 }],
        subject_topics: [{ id: 10, subject_id: 1, title: 'T1' }],
        subject_modules: [
          { id: 100, subject_id: 1, title: 'L1', topic_id: 10 },
          { id: 101, subject_id: 1, title: 'L2', topic_id: 999 },
        ],
      },
    }
    const out = prepareRestoreRowsForInsert(parsed, 'subject_modules', parsed.data.subject_modules)
    assert.equal(out.length, 2)
    assert.equal(out[0].topic_id, 10)
    assert.equal(out[1].topic_id, null)
  })

  test('omitRestoreInsertColumns strips deferred subject_modules topic_id', () => {
    const rows = [{ id: 1, title: 'L1', topic_id: 10, subject_id: 5 }]
    const out = omitRestoreInsertColumns('subject_modules', rows)
    assert.equal(out[0].topic_id, undefined)
    assert.equal(out[0].title, 'L1')
    assert.equal(omitRestoreInsertColumns('subjects', rows), rows)
  })

  test('omitRestoreInsertColumns strips topic_id on all curriculum item tables', () => {
    for (const table of ['study_materials', 'assignments', 'activities', 'quizzes']) {
      const out = omitRestoreInsertColumns(table, [{ id: 1, topic_id: 5 }])
      assert.equal(out[0].topic_id, undefined, table)
    }
  })

  test('prepareRestoreRowsForInsert skips subject_topics with invalid subject_id', () => {
    const parsed = {
      data: {
        subjects: [{ id: 1 }],
        subject_topics: [
          { id: 10, subject_id: 1, title: 'Ok' },
          { id: 11, subject_id: 99, title: 'Bad' },
        ],
      },
    }
    const out = prepareRestoreRowsForInsert(parsed, 'subject_topics', parsed.data.subject_topics)
    assert.equal(out.length, 1)
    assert.equal(out[0].id, 10)
  })

  test('captureTopicLinkPlan and purgeTopicIdsFromBackupData strip topic_id for insert', () => {
    const parsed = {
      data: {
        subject_modules: [{ id: 100, subject_id: 1, title: 'L1', topic_id: 10 }],
        study_materials: [{ id: 5, topic_id: 10 }],
      },
    }
    const plan = captureTopicLinkPlan(parsed)
    assert.equal(plan.length, 2)
    assert.equal(plan[0].tableKey, 'subject_modules')
    assert.equal(plan[0].topicId, 10)
    purgeTopicIdsFromBackupData(parsed)
    assert.equal(parsed.data.subject_modules[0].topic_id, undefined)
    assert.equal(parsed.data.study_materials[0].topic_id, undefined)
    const insertRows = omitRestoreInsertColumns('subject_modules', parsed.data.subject_modules)
    assert.equal('topic_id' in insertRows[0], false)
  })
})

describe('lnbak app_state curriculum mirror', () => {
  test('curriculumPgRowToAppStateMirror maps PostgreSQL row', () => {
    const mirror = curriculumPgRowToAppStateMirror(
      {
        id: 5,
        source_id: 'cur-uuid-1',
        title: 'Math',
        description: 'Algebra guide',
        grade_level: '10',
        file_name: 'math.pdf',
      },
      {
        file_type: 'application/pdf',
        file_data_url: 'data:application/pdf;base64,abc',
        uploaded_at: '2026-01-01',
        uploaded_by: 'Admin',
      },
    )
    assert.equal(mirror.id, 'cur-uuid-1')
    assert.equal(mirror.grade, '10')
    assert.equal(mirror.subject, 'Math')
    assert.equal(mirror.fileDataUrl, 'data:application/pdf;base64,abc')
  })

  test('mergeCurriculumMirrorsIntoAppStateJson upserts by id', () => {
    const merged = mergeCurriculumMirrorsIntoAppStateJson(
      { curriculums: [{ id: 'a', subject: 'Old' }] },
      [{ id: 'a', subject: 'New', grade: '11' }, { id: 'b', subject: 'Science', grade: '9' }],
    )
    assert.equal(merged.curriculums.length, 2)
    assert.equal(merged.curriculums.find((c) => c.id === 'a').subject, 'New')
    assert.equal(merged.curriculums.find((c) => c.id === 'b').grade, '9')
  })
})

describe('lnbak app_state faculty mirror', () => {
  test('facultyPgRowToAppStateMirror maps PostgreSQL row', () => {
    const mirror = facultyPgRowToAppStateMirror({
      id: 'fac-1',
      auth_user_id: 'auth-9',
      name: 'Jane Doe',
      first_name: 'Jane',
      last_name: 'Doe',
      email: 'jane@test.com',
      faculty_code: 'JD01',
      advisory_sections_json: JSON.stringify([{ id: 3, name: 'A', grade_level: '10' }]),
    })
    assert.equal(mirror.id, 'fac-1')
    assert.equal(mirror.authUserId, 'auth-9')
    assert.equal(mirror.email, 'jane@test.com')
    assert.equal(mirror.facultyCode, 'JD01')
    assert.equal(mirror.advisorySections.length, 1)
  })

  test('mergeFacultyMirrorsIntoAppStateJson upserts by id', () => {
    const merged = mergeFacultyMirrorsIntoAppStateJson(
      { faculties: [{ id: 'a', name: 'Old' }] },
      [
        { id: 'a', name: 'New', email: 'a@test.com' },
        { id: 'b', name: 'Beta', email: 'b@test.com' },
      ],
    )
    assert.equal(merged.faculties.length, 2)
    assert.equal(merged.faculties.find((f) => f.id === 'a').name, 'New')
    assert.equal(merged.faculties.find((f) => f.id === 'b').email, 'b@test.com')
  })
})

describe('lnbak app_state section mirror', () => {
  test('sectionPgRowToAppStateMirror maps PostgreSQL row', () => {
    const mirror = sectionPgRowToAppStateMirror({
      id: 12,
      section_name: 'Rose',
      grade_level: '10',
    })
    assert.equal(mirror.id, '12')
    assert.equal(mirror.postgresSectionId, 12)
    assert.equal(mirror.name, 'Rose')
    assert.equal(mirror.grade, '10')
  })

  test('mergeSectionMirrorsIntoAppStateJson merges by postgres id', () => {
    const merged = mergeSectionMirrorsIntoAppStateJson(
      { sections: [{ id: '5', name: 'Old', grade: '9' }] },
      [{ id: '5', postgresSectionId: 5, name: 'Updated', grade: '10' }],
    )
    assert.equal(merged.sections.length, 1)
    assert.equal(merged.sections[0].name, 'Updated')
    assert.equal(merged.sections[0].grade, '10')
  })
})

describe('lnbak institute restore warnings', () => {
  test('collectRestorePreflightWarnings flags empty faculties with subject refs', () => {
    const warnings = collectRestorePreflightWarnings({
      data: {
        faculties: [],
        subjects: [{ faculty_id: 'f1', subject_code: 'X' }],
        user: [],
      },
    })
    assert.ok(warnings.some((w) => w.includes('no faculty roster')))
  })

  test('collectRestorePreflightWarnings flags faculties without teacher users', () => {
    const warnings = collectRestorePreflightWarnings({
      data: {
        faculties: [{ id: 'f1', email: 't@test.com' }],
        user: [{ id: 'u1', role: 'admin', email: 'a@test.com' }],
      },
    })
    assert.ok(warnings.some((w) => w.includes('no teacher auth')))
  })

  test('collectRestorePreflightWarnings flags empty curriculum in backup', () => {
    const warnings = collectRestorePreflightWarnings({
      data: {
        faculties: [],
        curriculum: [],
        app_state: [{ id: 'default', json: { curriculums: [] } }],
        user: [],
      },
    })
    assert.ok(warnings.some((w) => w.includes('no curriculum')))
  })

  test('collectRestorePreflightWarnings flags empty student roster', () => {
    const warnings = collectRestorePreflightWarnings({
      data: { students: [], faculties: [{ id: 'f1' }], user: [] },
    })
    assert.ok(warnings.some((w) => w.includes('no student roster')))
  })

  test('collectRestorePreflightWarnings flags empty sections and app_state sections', () => {
    const warnings = collectRestorePreflightWarnings({
      data: {
        sections: [],
        app_state: [{ id: 'default', json: { sections: [] } }],
        user: [],
      },
    })
    assert.ok(warnings.some((w) => w.includes('no section rows')))
  })

  test('collectRestorePreflightWarnings flags empty subjects', () => {
    const warnings = collectRestorePreflightWarnings({
      data: { subjects: [], students: [{ id: 1 }], user: [] },
    })
    assert.ok(warnings.some((w) => w.includes('no subject rows')))
  })
})

describe('lnbak table order', () => {
  test('subject_topics come before subject_modules', () => {
    const ti = LNBAK_TABLE_ORDER.indexOf('subject_topics')
    const mi = LNBAK_TABLE_ORDER.indexOf('subject_modules')
    assert.ok(ti >= 0 && mi >= 0)
    assert.ok(ti < mi)
  })

  test('subject_module_subtopics come after subject_modules', () => {
    assert.ok(
      LNBAK_TABLE_ORDER.indexOf('subject_module_subtopics') >
        LNBAK_TABLE_ORDER.indexOf('subject_modules'),
    )
  })

  test('RESTORE_ENGINE_VERSION is set', () => {
    assert.ok(String(RESTORE_ENGINE_VERSION).includes('defer'))
  })

  test('quiz definitions come before quiz_submissions', () => {
    const qi = LNBAK_TABLE_ORDER.indexOf('quizzes')
    const qsi = LNBAK_TABLE_ORDER.indexOf('quiz_submissions')
    assert.ok(qi >= 0 && qsi >= 0)
    assert.ok(qi < qsi)
  })

  test('user comes before account', () => {
    assert.ok(LNBAK_TABLE_ORDER.indexOf('user') < LNBAK_TABLE_ORDER.indexOf('account'))
  })

  test('curriculum_guides comes after curriculum', () => {
    assert.ok(LNBAK_TABLE_ORDER.indexOf('curriculum_guides') > LNBAK_TABLE_ORDER.indexOf('curriculum'))
  })

  test('quiz_password_access comes after quizzes', () => {
    assert.ok(LNBAK_TABLE_ORDER.indexOf('quiz_password_access') > LNBAK_TABLE_ORDER.indexOf('quizzes'))
  })

  test('lms_activity_logs comes after audit_logs', () => {
    assert.ok(LNBAK_TABLE_ORDER.indexOf('lms_activity_logs') > LNBAK_TABLE_ORDER.indexOf('audit_logs'))
  })
})

describe('lnbak restore error helpers', () => {
  test('parsePostgresRestoreError extracts table and constraint', () => {
    const parsed = parsePostgresRestoreError(
      {
        code: '23503',
        constraint: 'subject_modules_topic_id_fkey',
        table: 'subject_modules',
        message: 'insert or update on table "subject_modules" violates foreign key constraint',
      },
      null,
    )
    assert.equal(parsed.failed_table, 'subject_modules')
    assert.equal(parsed.constraint, 'subject_modules_topic_id_fkey')
    assert.equal(parsed.pg_code, '23503')
    assert.equal(parsed.rolled_back, true)
  })

  test('enrichRestoreError produces RestoreFailedError', () => {
    const err = enrichRestoreError(
      { code: '23503', constraint: 'subject_modules_topic_id_fkey', message: 'fk fail' },
      'subject_modules',
    )
    assert.ok(err instanceof RestoreFailedError)
    assert.equal(err.failed_table, 'subject_modules')
    assert.match(err.message, /subject_modules/)
  })

  test('formatRestoreErrorPayload builds admin-visible response', () => {
    const payload = formatRestoreErrorPayload(
      new RestoreFailedError('Restore failed at table: subject_modules', {
        failed_table: 'subject_modules',
        constraint: 'subject_modules_topic_id_fkey',
        pg_code: '23503',
        detail: 'fk violation',
      }),
    )
    assert.equal(payload.error, 'RESTORE_FAILED')
    assert.equal(payload.failed_table, 'subject_modules')
    assert.equal(payload.constraint, 'subject_modules_topic_id_fkey')
    assert.equal(payload.rolled_back, true)
  })
})

describe('lnbak table discovery', () => {
  test('BACKUP_TABLE_EXCLUDE omits meta tables', () => {
    assert.ok(BACKUP_TABLE_EXCLUDE.has('backups'))
    assert.ok(BACKUP_TABLE_EXCLUDE.has('backup_schedules'))
    assert.ok(BACKUP_TABLE_EXCLUDE.has('session'))
  })
})

dbDescribe('lnbak export (PostgreSQL)', () => {
  test('exportBackupData includes auth user columns when users exist', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const { rows: countRows } = await pool.query('SELECT COUNT(*)::int AS c FROM "user"')
      if (Number(countRows[0]?.c || 0) === 0) return

      const { data } = await exportBackupData(pool)
      assert.ok(Array.isArray(data.user) && data.user.length > 0)
      const first = data.user[0]
      assert.ok('email' in first)
      assert.ok('createdAt' in first || 'username' in first)
      assert.ok(!('created_at' in first && !('createdAt' in first)))
    } finally {
      await pool.end()
    }
  })

  test('exportBackupData includes quizzes table key', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const { data } = await exportBackupData(pool)
      assert.ok(Object.prototype.hasOwnProperty.call(data, 'quizzes'))
      assert.ok(Object.prototype.hasOwnProperty.call(data, 'account'))
    } finally {
      await pool.end()
    }
  })

  test('exportBackupData includes app_state snapshot key', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const { data } = await exportBackupData(pool)
      assert.ok(Object.prototype.hasOwnProperty.call(data, 'app_state'))
      assert.ok(Array.isArray(data.app_state))
    } finally {
      await pool.end()
    }
  })

  test('exportBackupData app_state includes every active PostgreSQL faculty', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const { data } = await exportBackupData(pool)
      const active = (data.faculties || []).filter((f) => !f.archived_at)
      if (!active.length) return

      assert.ok(data.app_state.length > 0)
      let stateJson = data.app_state[0].json
      if (typeof stateJson === 'string') stateJson = JSON.parse(stateJson)
      const snapIds = new Set((stateJson.faculties || []).map((f) => String(f.id)))
      for (const f of active) {
        assert.ok(snapIds.has(String(f.id)), `app_state snapshot missing faculty ${f.id}`)
      }
    } finally {
      await pool.end()
    }
  })

  test('exportAppStateSnapshot returns PG faculty mirrors when app_state row missing', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const { rows } = await pool.query(
        `SELECT COUNT(*)::int AS c FROM public.faculties WHERE archived_at IS NULL`,
      )
      if (Number(rows[0]?.c || 0) === 0) return

      const snapshot = await exportAppStateSnapshot(pool)
      assert.ok(snapshot.length > 0)
      let stateJson = snapshot[0].json
      if (typeof stateJson === 'string') stateJson = JSON.parse(stateJson)
      assert.ok(Array.isArray(stateJson.faculties) && stateJson.faculties.length > 0)
    } finally {
      await pool.end()
    }
  })

  test('exportBackupData app_state includes sections when public.sections has rows', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const pgCount = await countSectionsRows(pool)
      if (pgCount === 0) return

      const { data } = await exportBackupData(pool)
      assert.ok(data.app_state.length > 0)
      let stateJson = data.app_state[0].json
      if (typeof stateJson === 'string') stateJson = JSON.parse(stateJson)
      const snapPgIds = new Set(
        (stateJson.sections || [])
          .map((s) => Number(s.postgresSectionId ?? s.id))
          .filter((n) => Number.isFinite(n) && n > 0),
      )
      for (const row of data.sections || []) {
        const id = Number(row.id)
        if (Number.isFinite(id) && id > 0) {
          assert.ok(snapPgIds.has(id), `app_state missing section ${id}`)
        }
      }
    } finally {
      await pool.end()
    }
  })

  test('exportBackupData app_state includes curriculum when public.curriculum has rows', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const pgCount = await countCurriculumRows(pool)
      if (pgCount === 0) return

      const { data } = await exportBackupData(pool)
      assert.ok(data.app_state.length > 0)
      let stateJson = data.app_state[0].json
      if (typeof stateJson === 'string') stateJson = JSON.parse(stateJson)
      const snapIds = new Set((stateJson.curriculums || []).map((c) => String(c.id)))
      for (const row of data.curriculum || []) {
        const sid = String(row.source_id || row.id || '').trim()
        if (sid) assert.ok(snapIds.has(sid), `app_state missing curriculum ${sid}`)
      }
    } finally {
      await pool.end()
    }
  })

  test('applyDeferredSubjectModuleTopicIds sets topic_id after modules insert', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    const client = await pool.connect()
    const subjectId = 999901
    const topicId = 999910
    const moduleId = 999920
    try {
      const { rows: subjTable } = await pool.query(
        `SELECT 1 FROM information_schema.tables
         WHERE table_schema = 'public' AND table_name = 'subjects' LIMIT 1`,
      )
      if (!subjTable.length) return

      await client.query('BEGIN')
      await client.query(
        `INSERT INTO public.subjects (id, subject_code, subject_name, grade_level, semester)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO NOTHING`,
        [subjectId, 'LNBAK-TST', 'Restore Test', '10', '1'],
      )
      await client.query(
        `INSERT INTO public.subject_topics (id, subject_id, title, topic_order)
         VALUES ($1, $2, $3, 0)
         ON CONFLICT (id) DO NOTHING`,
        [topicId, subjectId, 'Topic A'],
      )
      await client.query(
        `INSERT INTO public.subject_modules (id, subject_id, title, module_order, topic_id)
         VALUES ($1, $2, $3, 0, NULL)
         ON CONFLICT (id) DO UPDATE SET topic_id = NULL`,
        [moduleId, subjectId, 'Lesson A'],
      )

      const parsed = {
        data: {
          subjects: [{ id: subjectId }],
          subject_topics: [{ id: topicId, subject_id: subjectId, title: 'Topic A' }],
          subject_modules: [
            { id: moduleId, subject_id: subjectId, title: 'Lesson A', topic_id: topicId },
          ],
        },
      }

      const plan = captureTopicLinkPlan(parsed)
      const { updated } = await applyDeferredTopicIdsFromPlan(client, plan, pool)
      assert.equal(updated, 1)

      const { rows } = await client.query(
        `SELECT topic_id::int AS topic_id FROM public.subject_modules WHERE id = $1`,
        [moduleId],
      )
      assert.equal(rows[0]?.topic_id, topicId)
    } finally {
      await client.query('ROLLBACK').catch(() => {})
      client.release()
      await pool.end()
    }
  })

  test('discoverBackupTables excludes backups and backup_schedules', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const tables = await discoverBackupTables(pool)
      assert.ok(Array.isArray(tables) && tables.length > 0)
      assert.ok(!tables.includes('backups'))
      assert.ok(!tables.includes('backup_schedules'))
    } finally {
      await pool.end()
    }
  })

  test('resolveBackupTableOrder starts with curated order', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    try {
      const order = await resolveBackupTableOrder(pool)
      assert.ok(order.indexOf('subject_topics') < order.indexOf('subject_modules'))
      assert.ok(order.indexOf('user') >= 0)
    } finally {
      await pool.end()
    }
  })

  test('beginRestoreSession and endRestoreSession run without error', async () => {
    process.env.BETTER_AUTH_SECRET = BETTER_AUTH_SECRET_FOR_TESTS
    const pool = new pg.Pool({ connectionString: PG_TEST_URL })
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const mode = await beginRestoreSession(client)
      assert.ok(['replica', 'deferred', 'none'].includes(mode))
      await endRestoreSession(client, mode)
      await client.query('ROLLBACK')
    } finally {
      client.release()
      await pool.end()
    }
  })
})
