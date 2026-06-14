import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** Mirror of Frontend/src/lib/offlineFetch.js stripCacheMeta (pure, no browser deps). */
function stripCacheMeta(row) {
  if (!row || typeof row !== 'object') return row
  const { cachedAt: _c, updatedAt: _u, ...rest } = row
  return rest
}

describe('stripCacheMeta', () => {
  it('removes cachedAt and updatedAt from cached rows', () => {
    const row = { id: '1', title: 'Quiz', cachedAt: 123, updatedAt: 456 }
    assert.deepEqual(stripCacheMeta(row), { id: '1', title: 'Quiz' })
  })

  it('returns non-objects unchanged', () => {
    assert.equal(stripCacheMeta(null), null)
    assert.equal(stripCacheMeta('x'), 'x')
  })
})

describe('offlineFetch module (source contract)', () => {
  it('exports fetchWithOfflineCache and warmViewedContent', () => {
    const src = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'lib', 'offlineFetch.js'), 'utf8')
    assert.ok(src.includes('export async function fetchWithOfflineCache'))
    assert.ok(src.includes('export async function warmViewedContent'))
    assert.ok(src.includes('export function stripCacheMeta'))
  })
})

describe('IndexedDB offline stores (schema)', () => {
  it('includes v3 gap-closure stores', () => {
    const idb = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'lib', 'indexedDB.js'), 'utf8')
    const required = [
      'subject_streams',
      'quiz_details',
      'quiz_results',
      'admin_students',
      'admin_faculties',
      'admin_subjects',
      'admin_sections',
      'faculty_work_details',
      'faculty_grades_overview',
      'faculty_subject_streams',
    ]
    for (const name of required) {
      assert.ok(idb.includes(`'${name}'`), `missing store: ${name}`)
    }
    assert.ok(idb.includes('DB_VERSION = 3'))
  })
})
