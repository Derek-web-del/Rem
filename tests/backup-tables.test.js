import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeBackupTableKeys, DEFAULT_BACKUP_TABLE_KEYS } from '../server/lib/backupTables.js'

test('normalizeBackupTableKeys rejects unknown tables', () => {
  const out = normalizeBackupTableKeys(['students', 'evil_table', 'faculties'])
  assert.ok(out.includes('students'))
  assert.ok(out.includes('faculties'))
  assert.equal(out.includes('evil_table'), false)
})

test('normalizeBackupTableKeys falls back to defaults when empty', () => {
  const out = normalizeBackupTableKeys([])
  assert.deepEqual(out, DEFAULT_BACKUP_TABLE_KEYS)
})

test('DEFAULT_BACKUP_TABLE_KEYS includes auth and quiz tables', () => {
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('account'))
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('quizzes'))
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('quiz_submissions'))
})

test('DEFAULT_BACKUP_TABLE_KEYS includes expanded recovery tables', () => {
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('lms_activity_logs'))
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('curriculum_guides'))
  assert.ok(DEFAULT_BACKUP_TABLE_KEYS.includes('subject_schedules'))
})
