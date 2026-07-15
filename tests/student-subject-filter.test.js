import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { filterSubjectsWithoutScheduleConflicts } from '../server/lib/scheduleConflict.js'

describe('student subject schedule filter', () => {
  it('excludes subjects that overlap an already-kept subject on the same weekday', () => {
    const subjects = [
      {
        id: 1,
        subject_code: 'ZPE7',
        schedules: [{ day_of_week: 3, start_time: '10:30', end_time: '11:30' }],
      },
      {
        id: 2,
        subject_code: 'SCI7',
        schedules: [{ day_of_week: 3, start_time: '10:00', end_time: '11:00' }],
      },
      {
        id: 3,
        subject_code: 'ENG7',
        schedules: [{ day_of_week: 1, start_time: '08:00', end_time: '09:00' }],
      },
    ]

    const visible = filterSubjectsWithoutScheduleConflicts(subjects)
    assert.deepEqual(
      visible.map((s) => s.subject_code),
      ['ENG7', 'SCI7'],
    )
  })

  it('uses subject_code then id for deterministic keep order', () => {
    const subjects = [
      {
        id: 99,
        subject_code: 'ZZZ',
        schedules: [{ day_of_week: 1, start_time: '08:00', end_time: '09:00' }],
      },
      {
        id: 1,
        subject_code: 'AAA',
        schedules: [{ day_of_week: 1, start_time: '08:00', end_time: '09:00' }],
      },
    ]
    const visible = filterSubjectsWithoutScheduleConflicts(subjects)
    assert.equal(visible.length, 1)
    assert.equal(visible[0].subject_code, 'AAA')
  })
})
