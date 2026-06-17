import pg from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[db-empty-tables-audit] DATABASE_URL is not set')
  process.exit(1)
}

/** Known write paths and whether empty is typically expected. */
const TABLE_META = {
  user: { writes: 'server/auth.js (Better Auth)', expectedEmpty: false },
  session: { writes: 'server/auth.js (Better Auth)', expectedEmpty: false },
  account: { writes: 'server/auth.js (Better Auth)', expectedEmpty: 'maybe (OAuth only)' },
  verification: { writes: 'server/auth.js (Better Auth)', expectedEmpty: 'maybe' },
  jwks: { writes: 'server/auth.js (JWT keys)', expectedEmpty: 'maybe' },
  app_state: { writes: 'server/api/state/shared.js', expectedEmpty: false },
  students: { writes: 'server/api/state/shared.js, admin roster', expectedEmpty: false },
  faculties: { writes: 'server/api/state/shared.js, admin roster', expectedEmpty: false },
  faculty_sections: { writes: 'server/lib/gradesDb.js, faculty advisory links', expectedEmpty: 'maybe if no advisories' },
  sections: { writes: 'server/api/state/shared.js', expectedEmpty: false },
  institute_sections: { writes: 'server/api/state/shared.js (legacy mirror of sections)', expectedEmpty: 'maybe (sections table used instead)' },
  subjects: { writes: 'server/api/state/shared.js, teacher APIs', expectedEmpty: false },
  curriculum: { writes: 'server/api/state/shared.js', expectedEmpty: 'maybe' },
  curriculum_guides: { writes: 'server/api/state/curriculumRouter.js', expectedEmpty: 'maybe' },
  announcements: { writes: 'server/api/teacher.js, announcements APIs', expectedEmpty: 'maybe' },
  study_materials: { writes: 'server/api/teacher.js', expectedEmpty: 'maybe' },
  faculty_study_materials: { writes: 'server/lib/facultyStudyMaterialsDb.js', expectedEmpty: 'maybe' },
  subject_materials: { writes: 'server/lib/studentSubjectMaterials.js', expectedEmpty: 'maybe' },
  assignments: { writes: 'server/api/teacher.js', expectedEmpty: 'maybe' },
  assignment_submissions: { writes: 'server/api/studentWorkV1.js', expectedEmpty: 'maybe until students submit' },
  activities: { writes: 'server/api/teacher.js', expectedEmpty: 'maybe' },
  activity_submissions: { writes: 'server/lib/activitiesDb.js', expectedEmpty: 'maybe until students submit' },
  quizzes: { writes: 'server/lib/quizzesDb.js', expectedEmpty: 'maybe' },
  quiz_parts: { writes: 'server/lib/quizzesDb.js', expectedEmpty: 'maybe' },
  quiz_questions: { writes: 'server/lib/quizzesDb.js', expectedEmpty: 'maybe' },
  quiz_choices: { writes: 'server/lib/quizzesDb.js', expectedEmpty: 'maybe' },
  quiz_answers: { writes: 'server/lib/quizzesDb.js', expectedEmpty: 'maybe' },
  quiz_submissions: { writes: 'server/lib/quizSubmissionsDb.js', expectedEmpty: 'maybe until quizzes taken' },
  quiz_student_answers: { writes: 'server/lib/quizSubmissionsDb.js', expectedEmpty: 'maybe' },
  quiz_password_access: { writes: 'server/lib/quizzesDb.js', expectedEmpty: true },
  subject_modules: { writes: 'server/lib/subjectCurriculumDb.js', expectedEmpty: 'maybe' },
  subject_topics: { writes: 'server/lib/subjectCurriculumDb.js', expectedEmpty: 'maybe' },
  subject_module_subtopics: { writes: 'server/lib/subjectCurriculumDb.js', expectedEmpty: true },
  subject_grade_criteria: { writes: 'server/lib/subjectGradeCriteriaDb.js (legacy)', expectedEmpty: true },
  subject_grade_components: { writes: 'server/lib/subjectGradeCriteriaDb.js', expectedEmpty: 'maybe' },
  subject_student_final_grades: { writes: 'server/lib/gradebookDb.js', expectedEmpty: 'maybe' },
  plagiarism_reports: { writes: 'server/lib/plagiarismDb.js', expectedEmpty: true },
  audit_logs: { writes: 'server/lib/auditLogsLedger.js', expectedEmpty: 'maybe' },
  lms_activity_logs: { writes: 'server/services/CustomActivityLogger.js', expectedEmpty: 'maybe' },
  backups: { writes: 'server/lib/backupService.js', expectedEmpty: true },
  backup_schedules: { writes: 'server/lib/backupSchema.js (seeded on init)', expectedEmpty: false },
  google_oauth_tokens: { writes: 'server/lib/backupService.js', expectedEmpty: true },
  google_oauth_pending: { writes: 'server/lib/backupSchema.js', expectedEmpty: true },
}

const pool = new pg.Pool({ connectionString })

try {
  const dbInfo = await pool.query('SELECT current_database() AS db, NOW() AS time')
  console.log('=== Database Empty Table Audit ===')
  console.log('Database:', dbInfo.rows[0].db)
  console.log('Time:', dbInfo.rows[0].time)
  console.log('')

  const tablesResult = await pool.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `)

  const allTables = []
  const emptyTables = []

  for (const row of tablesResult.rows) {
    const name = row.table_name
    const quoted = name === 'user' ? '"user"' : `public."${name.replace(/"/g, '""')}"`
    try {
      const { rows: countRows } = await pool.query(`SELECT COUNT(*)::bigint AS n FROM ${quoted}`)
      const exact = Number(countRows[0].n)
      allTables.push({ name, exact })
      if (exact === 0) emptyTables.push({ name, exact })
    } catch (err) {
      console.warn(`[warn] Could not count ${name}: ${err.message}`)
    }
  }

  console.log(`Total public tables: ${allTables.length}`)
  console.log(`Empty tables (0 rows): ${emptyTables.length}`)
  console.log('')

  if (emptyTables.length === 0) {
    console.log('No empty tables found.')
  } else {
    console.log('--- Empty tables (detailed) ---')
    for (const t of emptyTables) {
      const meta = TABLE_META[t.name] || { writes: 'unknown / check migrations', expectedEmpty: 'unknown' }
      const expected =
        meta.expectedEmpty === true
          ? 'EXPECTED (feature unused or optional)'
          : meta.expectedEmpty === false
            ? 'SUSPICIOUS (core table should have data)'
            : `CONDITIONAL (${meta.expectedEmpty})`
      console.log('')
      console.log(`Table: ${t.name}`)
      console.log(`  Rows: ${t.exact}`)
      console.log(`  Write path: ${meta.writes}`)
      console.log(`  Assessment: ${expected}`)
    }
  }

  console.log('')
  console.log('--- All tables (row counts) ---')
  for (const t of allTables.sort((a, b) => a.name.localeCompare(b.name))) {
    const flag = t.exact === 0 ? ' [EMPTY]' : ''
    console.log(`${t.name}: ${t.exact}${flag}`)
  }

  const suspicious = emptyTables.filter((t) => {
    const meta = TABLE_META[t.name]
    return meta && meta.expectedEmpty === false
  })

  if (suspicious.length > 0) {
    console.log('')
    console.log('--- Action recommended ---')
    for (const t of suspicious) {
      console.log(`- ${t.name}: expected data but has 0 rows — verify migrations and app usage`)
    }
  }
} catch (err) {
  console.error('[db-empty-tables-audit] failed:', err.message)
  process.exit(1)
} finally {
  await pool.end()
}
