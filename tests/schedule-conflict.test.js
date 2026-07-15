import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  expandScheduleSpec,
  filterSubjectsWithoutScheduleConflicts,
  timeRangesOverlap,
} from '../server/lib/scheduleConflict.js'

describe('scheduleConflict overlap math', () => {
  it('timeRangesOverlap uses exclusive end boundaries', () => {
    assert.equal(timeRangesOverlap('08:00', '09:00', '09:00', '10:00'), false)
    assert.equal(timeRangesOverlap('08:00', '09:00', '08:30', '09:30'), true)
    assert.equal(timeRangesOverlap('08:00', '09:00', '07:00', '08:00'), false)
  })

  it('expandScheduleSpec expands weekday list into slots', () => {
    const slots = expandScheduleSpec({ days: ['1', '3'], start_time: '08:00', end_time: '09:00' })
    assert.equal(slots.length, 2)
    assert.deepEqual(slots[0], { day_of_week: 1, start_time: '08:00', end_time: '09:00' })
    assert.deepEqual(slots[1], { day_of_week: 3, start_time: '08:00', end_time: '09:00' })
  })
})

describe('scheduleConflict faculty and grade detection (unit)', () => {
  it('filterSubjectsWithoutScheduleConflicts drops later overlapping subjects deterministically', () => {
    const subjects = [
      {
        id: 2,
        subject_code: 'MATH7',
        schedules: [{ day_of_week: 1, start_time: '08:00', end_time: '09:00' }],
      },
      {
        id: 1,
        subject_code: 'ENG7',
        schedules: [{ day_of_week: 1, start_time: '08:30', end_time: '09:30' }],
      },
      {
        id: 3,
        subject_code: 'SCI7',
        schedules: [{ day_of_week: 1, start_time: '10:00', end_time: '11:00' }],
      },
    ]
    const kept = filterSubjectsWithoutScheduleConflicts(subjects)
    assert.deepEqual(
      kept.map((s) => s.subject_code),
      ['ENG7', 'SCI7'],
    )
  })

  it('keeps non-overlapping subjects in subject_code order', () => {
    const subjects = [
      {
        id: 10,
        subject_code: 'A',
        schedules: [{ day_of_week: 2, start_time: '08:00', end_time: '09:00' }],
      },
      {
        id: 11,
        subject_code: 'B',
        schedules: [{ day_of_week: 3, start_time: '08:00', end_time: '09:00' }],
      },
    ]
    const kept = filterSubjectsWithoutScheduleConflicts(subjects)
    assert.equal(kept.length, 2)
  })
})
