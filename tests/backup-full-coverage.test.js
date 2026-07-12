import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKUP_MODULE_COVERAGE,
  allBackupModuleTableKeys,
  allBackupFileFields,
  allBackupUploadDirs,
  summarizeModuleCoverage,
} from '../server/lib/backupCoverage.js'
import { LNBAK_TABLE_ORDER } from '../server/lib/lnbakEngine.js'
import { LNBAK_TABLE_KEYS } from '../server/lib/backupTables.js'
import { uploadsRoot } from '../server/lib/uploadPaths.js'
import path from 'node:path'

describe('backup full module coverage', () => {
  test('every module table is in LNBAK_TABLE_ORDER and backupTables registry', () => {
    const orderSet = new Set(LNBAK_TABLE_ORDER)
    const registrySet = new Set(LNBAK_TABLE_KEYS)
    const missing = []
    for (const key of allBackupModuleTableKeys()) {
      if (!orderSet.has(key)) missing.push(`LNBAK_TABLE_ORDER:${key}`)
      if (!registrySet.has(key)) missing.push(`LNBAK_TABLE_KEYS:${key}`)
    }
    assert.deepEqual(missing, [], `Missing tables: ${missing.join(', ')}`)
  })

  test('module coverage summary shows all modules covered', () => {
    const summary = summarizeModuleCoverage(LNBAK_TABLE_ORDER)
    assert.equal(summary.length, BACKUP_MODULE_COVERAGE.length)
    const uncovered = summary.filter((m) => !m.covered && m.tables.length > 0)
    assert.deepEqual(
      uncovered.map((m) => `${m.module} → ${m.missing_tables.join(', ')}`),
      [],
    )
  })

  test('submission and classwork modules include file fields and upload dirs', () => {
    const submissions = BACKUP_MODULE_COVERAGE.filter((m) =>
      /submission|assignment|activity|curriculum|faculty|announcement|material|syllabus|subject/i.test(
        m.module,
      ),
    )
    assert.ok(submissions.length >= 8)
    for (const m of submissions) {
      if (m.fileFields?.length) {
        for (const f of m.fileFields) {
          assert.ok(allBackupFileFields().includes(f), `${m.module} field ${f}`)
        }
      }
    }
    assert.ok(allBackupUploadDirs().includes('submissions/assignments'))
    assert.ok(allBackupUploadDirs().includes('submissions/activities'))
    assert.ok(allBackupUploadDirs().includes('Subjects_images'))
  })

  test('classwork restore order: parents before submissions', () => {
    const parents = ['assignments', 'activities', 'quizzes']
    const children = ['assignment_submissions', 'activity_submissions', 'quiz_submissions']
    for (const p of parents) {
      for (const c of children) {
        if (c.startsWith(p.split('_')[0])) {
          assert.ok(
            LNBAK_TABLE_ORDER.indexOf(p) < LNBAK_TABLE_ORDER.indexOf(c),
            `${p} must precede ${c}`,
          )
        }
      }
    }
  })

  test('uploads root resolves consistently for backup engine', () => {
    const root = uploadsRoot()
    assert.ok(path.isAbsolute(root))
    assert.ok(root.replace(/\\/g, '/').includes('uploads'))
  })
})

describe('backup role coverage checklist', () => {
  test('admin, teacher, and student roles are represented', () => {
    const roles = new Set(BACKUP_MODULE_COVERAGE.flatMap((m) => m.roles))
    assert.ok(roles.has('admin'))
    assert.ok(roles.has('teacher'))
    assert.ok(roles.has('student'))
  })

  test('student quiz and submission tables are backed up', () => {
    const keys = allBackupModuleTableKeys()
    for (const k of [
      'assignment_submissions',
      'activity_submissions',
      'quiz_submissions',
      'quiz_student_answers',
    ]) {
      assert.ok(keys.includes(k), k)
    }
  })

  test('teacher publish/save entities are backed up', () => {
    const keys = allBackupModuleTableKeys()
    for (const k of [
      'assignments',
      'activities',
      'quizzes',
      'quiz_questions',
      'quiz_choices',
      'subject_modules',
      'study_materials',
    ]) {
      assert.ok(keys.includes(k), k)
    }
  })
})
