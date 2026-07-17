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
  })

  it('includes the admin_curriculum store and getListSnapshotWithMeta helper (v4)', () => {
    const idb = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'lib', 'indexedDB.js'), 'utf8')
    assert.ok(idb.includes("'admin_curriculum'"), 'missing store: admin_curriculum')
    assert.ok(idb.includes('DB_VERSION = 4'))
    assert.ok(idb.includes('export async function getListSnapshotWithMeta'))
  })
})

describe('OfflineCacheIndicator (cachedAt support)', () => {
  it('accepts a cachedAt prop and renders a relative-time message', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'Frontend', 'src', 'components', 'OfflineCacheIndicator.jsx'),
      'utf8',
    )
    assert.ok(src.includes('cachedAt'), 'component should accept a cachedAt prop')
    assert.ok(src.includes('Showing cached data'))
  })
})

describe('InstituteDashboard admin curriculum offline fallback', () => {
  it('refreshCurriculumFromPostgres falls back to the admin_curriculum cache', () => {
    const src = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'InstituteDashboard.jsx'), 'utf8')
    const start = src.indexOf('const refreshCurriculumFromPostgres')
    assert.ok(start !== -1, 'refreshCurriculumFromPostgres not found')
    const fnSrc = src.slice(start, start + 1500)
    assert.ok(fnSrc.includes('admin_curriculum'), 'refreshCurriculumFromPostgres should read/write admin_curriculum cache')
    assert.ok(fnSrc.includes('getListSnapshotWithMeta'), 'refreshCurriculumFromPostgres should use getListSnapshotWithMeta for fallback')
    assert.ok(fnSrc.includes('fromCache: true'), 'refreshCurriculumFromPostgres should report fromCache on fallback')
  })
})
