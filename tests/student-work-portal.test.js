import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mapStudentWorkListRow } from '../server/lib/studentWorkPortal.js'

describe('mapStudentWorkListRow status tones', () => {
  const baseRow = {
    id: 1,
    title: 'Essay 1',
    subject_name: 'English',
    grade_level: 'Grade 7',
    total_score: 100,
    submission_deadline: '2099-12-31T23:59:59.000Z',
    created_at: '2026-01-01T00:00:00.000Z',
    file_path: '/uploads/assignments/a.pdf',
    file_name: 'a.pdf',
  }

  it('uses grade-percent tones for scored submissions', () => {
    const item = mapStudentWorkListRow(
      baseRow,
      { id: 10, status: 'graded', score: 80, submitted_at: '2026-01-02T00:00:00.000Z' },
      'assignment',
    )
    assert.equal(item.status, 'Score: 80/100')
    assert.equal(item.status_tone, 'passed')
  })

  it('uses at_risk for 60-74 percent', () => {
    const item = mapStudentWorkListRow(
      baseRow,
      { id: 10, status: 'graded', score: 65 },
      'assignment',
    )
    assert.equal(item.status_tone, 'at_risk')
  })

  it('uses failed for expired zero score', () => {
    const item = mapStudentWorkListRow(
      baseRow,
      { id: 10, status: 'expired', score: 0 },
      'assignment',
    )
    assert.equal(item.status, 'Score: 0/100')
    assert.equal(item.status_tone, 'failed')
  })

  it('uses pending for submitted without score', () => {
    const item = mapStudentWorkListRow(
      baseRow,
      { id: 10, status: 'submitted', submitted_at: '2026-01-02T00:00:00.000Z', file_path: '/x.pdf' },
      'activity',
    )
    assert.equal(item.status, 'Pending')
    assert.equal(item.status_tone, 'pending')
  })
})
