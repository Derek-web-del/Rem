import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  fetchWorkItemSubjectId,
  assertFacultyCanGrantSubmissionExtension,
} from '../server/lib/submissionExtensionAuth.js'

describe('submissionExtensionAuth', () => {
  it('fetchWorkItemSubjectId returns null for invalid input', async () => {
    const pool = { query: async () => ({ rows: [] }) }
    assert.equal(await fetchWorkItemSubjectId(pool, 'invalid', 1), null)
    assert.equal(await fetchWorkItemSubjectId(pool, 'assignment', 0), null)
  })

  it('fetchWorkItemSubjectId reads subject_id from entity table', async () => {
    let sql = ''
    const pool = {
      query: async (q) => {
        sql = q
        return { rows: [{ subject_id: 42 }] }
      },
    }
    const subjectId = await fetchWorkItemSubjectId(pool, 'assignment', 7)
    assert.equal(subjectId, 42)
    assert.match(sql, /assignments/)
  })

  it('assertFacultyCanGrantSubmissionExtension rejects bad ids', async () => {
    const pool = { query: async () => ({ rows: [] }) }
    const result = await assertFacultyCanGrantSubmissionExtension(pool, { id: 'fac-1' }, {
      entityType: 'assignment',
      entityId: 0,
      studentId: 1,
    })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'BAD_REQUEST')
  })

  it('assertFacultyCanGrantSubmissionExtension rejects missing faculty profile', async () => {
    const pool = { query: async () => ({ rows: [] }) }
    const result = await assertFacultyCanGrantSubmissionExtension(pool, null, {
      entityType: 'assignment',
      entityId: 5,
      studentId: 1,
    })
    assert.equal(result.ok, false)
    assert.equal(result.error, 'FACULTY_NOT_FOUND')
  })
})
