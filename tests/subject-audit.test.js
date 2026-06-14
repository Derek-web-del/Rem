import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  subjectPgRowSnapshot,
  computeSubjectDetailedDiffs,
  subjectAuditDescription,
  subjectAuditDetails,
} from '../server/lib/subjectAudit.js'

describe('subjectAudit', () => {
  it('subjectPgRowSnapshot maps PostgreSQL row fields', () => {
    const snap = subjectPgRowSnapshot(
      {
        id: 5,
        subject_code: 'ENG1',
        subject_name: 'English 1',
        grade_level: 'Grade 7',
        semester: '1',
        faculty_id: '12',
      },
      'Jane Doe',
    )
    assert.equal(snap.id, '5')
    assert.equal(snap.subjectCode, 'ENG1')
    assert.equal(snap.subjectName, 'English 1')
    assert.equal(snap.gradeLevel, 'Grade 7')
    assert.equal(snap.semester, '1')
    assert.equal(snap.facultyName, 'Jane Doe')
  })

  it('computeSubjectDetailedDiffs returns Old/New pairs for changed fields', () => {
    const diffs = computeSubjectDetailedDiffs(
      {
        subject_code: 'ENG1',
        subject_name: 'English 1',
        grade_level: 'Grade 7',
        semester: '1',
        faculty_id: '12',
        syllabus_pdf: 'old.pdf',
      },
      {
        subject_code: 'ENG1',
        subject_name: 'English I',
        grade_level: 'Grade 7',
        semester: '2',
        faculty_id: '15',
        syllabus_pdf: 'new.pdf',
      },
      { oldFacultyName: 'Jane Doe', newFacultyName: 'John Smith' },
    )
    assert.deepEqual(diffs['Subject name'], { old: 'English 1', new: 'English I' })
    assert.deepEqual(diffs.Semester, { old: '1', new: '2' })
    assert.deepEqual(diffs['Assigned faculty'], { old: 'Jane Doe', new: 'John Smith' })
    assert.ok(diffs['Syllabus file'])
  })

  it('subjectAuditDescription and subjectAuditDetails format audit payload', () => {
    const snap = subjectPgRowSnapshot({
      id: 1,
      subject_code: 'MATH1',
      subject_name: 'Mathematics',
      grade_level: 'Grade 8',
      semester: '3',
    })
    assert.equal(subjectAuditDescription('updated', snap), 'Subject updated: Mathematics (Grade 8)')
    const details = subjectAuditDetails(snap)
    assert.equal(details.subjectCode, 'MATH1')
    assert.equal(details.subjectName, 'Mathematics')
    assert.equal(details.gradeLevel, 'Grade 8')
  })
})
