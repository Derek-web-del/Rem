import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeGradeCriteriaDetailedDiffs,
  summarizeGradeCriteriaComponents,
} from '../server/lib/gradeCriteriaAudit.js'

describe('gradeCriteriaAudit', () => {
  const base = [
    {
      id: '1',
      name: 'Written Work',
      percentage: 25,
      maps_to: ['Assignment'],
      maps_to_assignment: true,
      maps_to_activity: false,
      is_quiz: false,
    },
    {
      id: '2',
      name: 'Quizzes',
      percentage: 15,
      maps_to: ['Quiz'],
      maps_to_assignment: false,
      maps_to_activity: false,
      is_quiz: true,
    },
  ]

  it('detects percentage changes with readable labels', () => {
    const next = base.map((row) =>
      row.name === 'Written Work' ? { ...row, percentage: 30 } : row,
    )
    const diffs = computeGradeCriteriaDetailedDiffs(base, next)
    assert.equal(diffs['Written Work %'].old, '25%')
    assert.equal(diffs['Written Work %'].new, '30%')
  })

  it('detects maps-to changes', () => {
    const next = base.map((row) =>
      row.name === 'Quizzes'
        ? {
            ...row,
            maps_to: ['Quiz', 'Activity'],
            maps_to_activity: true,
          }
        : row,
    )
    const diffs = computeGradeCriteriaDetailedDiffs(base, next)
    assert.equal(diffs['Quizzes maps to'].old, 'Quiz')
    assert.equal(diffs['Quizzes maps to'].new, 'Quiz, Activity')
  })

  it('summarizes components as flat scalar map', () => {
    const summary = summarizeGradeCriteriaComponents(base)
    assert.equal(summary['Written Work %'], '25%')
    assert.equal(summary['Quizzes maps to'], 'Quiz')
  })
})
