import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildFacultyComparePayload,
  computeFacultyProfileDetailedDiffs,
  extractFacultySectionIdsFromRow,
  normalizeSectionIds,
  sectionIdSetsEqual,
} from '../server/lib/facultyProfileAudit.js'

describe('facultyProfileAudit section ids', () => {
  it('treats null and empty advisory json as equivalent empty sets', () => {
    const fromNull = extractFacultySectionIdsFromRow({ advisory_sections_json: null }, [])
    const fromEmpty = extractFacultySectionIdsFromRow({ advisory_sections_json: '[]' }, [])
    assert.deepEqual(fromNull, [])
    assert.deepEqual(fromEmpty, [])
    assert.equal(sectionIdSetsEqual(fromNull, fromEmpty), true)
  })

  it('reads section ids from advisory_sections_json when junction is empty', () => {
    const row = {
      advisory_sections_json: JSON.stringify([
        { id: '3', postgresSectionId: 3, name: 'St. John' },
        { postgresSectionId: 7, section_name: 'St. Paul' },
      ]),
    }
    assert.deepEqual(extractFacultySectionIdsFromRow(row, []), [3, 7])
  })

  it('sectionIdSetsEqual ignores order', () => {
    assert.equal(sectionIdSetsEqual([7, 3], [3, 7]), true)
    assert.equal(sectionIdSetsEqual([3], [7]), false)
  })
})

describe('computeFacultyProfileDetailedDiffs', () => {
  const oldRow = {
    first_name: 'Jamie',
    last_name: 'Bantad',
    email: 'jamie@school.edu',
    photo_url: '/uploads/faculties/jamie.jpg',
    advisory_sections_json: JSON.stringify([{ postgresSectionId: 5 }]),
  }

  it('does not flag advisory sections when ids are unchanged', async () => {
    const newData = buildFacultyComparePayload(
      { firstName: 'Jamie', lastName: 'Bantad', email: 'jamie@school.edu' },
      [5],
    )
    const diffs = await computeFacultyProfileDetailedDiffs(oldRow, newData, {
      pool: null,
      oldSectionIds: [5],
      newSectionIds: [5],
      photoChanged: false,
    })
    assert.equal(diffs['Advisory sections'], undefined)
    assert.equal(Object.keys(diffs).length, 0)
  })

  it('flags advisory sections only when ids change', async () => {
    const newData = buildFacultyComparePayload(
      { firstName: 'Jamie', lastName: 'Bantad', email: 'jamie@school.edu' },
      [5, 8],
    )
    const diffs = await computeFacultyProfileDetailedDiffs(oldRow, newData, {
      pool: null,
      oldSectionIds: extractFacultySectionIdsFromRow(oldRow, []),
      newSectionIds: [5, 8],
      photoChanged: false,
    })
    assert.ok(diffs['Advisory sections'])
    assert.equal(diffs['Student/Faculty Photo'], undefined)
  })

  it('flags photo only when photoChanged is true', async () => {
    const newData = buildFacultyComparePayload(
      {
        firstName: 'Jamie',
        lastName: 'Bantad',
        email: 'jamie@school.edu',
        photo_url: '/uploads/faculties/jamie.jpg',
      },
      [5],
    )
    const unchanged = await computeFacultyProfileDetailedDiffs(oldRow, newData, {
      pool: null,
      oldSectionIds: [5],
      newSectionIds: [5],
      photoChanged: false,
    })
    assert.equal(unchanged['Student/Faculty Photo'], undefined)

    const changed = await computeFacultyProfileDetailedDiffs(oldRow, newData, {
      pool: null,
      oldSectionIds: [5],
      newSectionIds: [5],
      photoChanged: true,
    })
    assert.ok(changed['Student/Faculty Photo'])
    assert.equal(changed['Advisory sections'], undefined)
  })

  it('flags first name only when that field changes', async () => {
    const newData = buildFacultyComparePayload(
      { firstName: 'James', lastName: 'Bantad', email: 'jamie@school.edu' },
      [5],
    )
    const diffs = await computeFacultyProfileDetailedDiffs(oldRow, newData, {
      pool: null,
      oldSectionIds: [5],
      newSectionIds: [5],
      photoChanged: false,
    })
    assert.deepEqual(Object.keys(diffs), ['First name'])
  })
})

describe('normalizeSectionIds', () => {
  it('coerces object and scalar entries', () => {
    assert.deepEqual(
      normalizeSectionIds([{ postgresSectionId: 2 }, { id: '9' }, 5, null]),
      [2, 5, 9],
    )
  })
})
