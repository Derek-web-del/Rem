import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  computePercent,
  countGradedSubmissions,
  displayGrade,
  formatGradeAvg,
  formatScoreWithPercent,
  gradeStatusFromPercent,
} from '../Frontend/src/lib/gradeStatus.js'

describe('gradeStatus', () => {
  it('gradeStatusFromPercent uses 75+ green, 60-74 yellow, below 60 red tones', () => {
    assert.equal(gradeStatusFromPercent(75).tone, 'passed')
    assert.equal(gradeStatusFromPercent(80).tone, 'passed')
    assert.equal(gradeStatusFromPercent(74).tone, 'at_risk')
    assert.equal(gradeStatusFromPercent(60).tone, 'at_risk')
    assert.equal(gradeStatusFromPercent(59).tone, 'failed')
    assert.equal(gradeStatusFromPercent(0).tone, 'failed')
  })

  it('gradeStatusFromPercent shows neutral Not started when noScoresYet', () => {
    const status = gradeStatusFromPercent(0, { noScoresYet: true })
    assert.equal(status.label, 'Not started')
    assert.equal(status.tone, 'neutral')
  })

  it('displayGrade and formatGradeAvg default null to 0', () => {
    assert.equal(displayGrade(null), 0)
    assert.equal(displayGrade(undefined), 0)
    assert.equal(formatGradeAvg(null), '0%')
    assert.equal(formatGradeAvg(undefined), '0%')
    assert.equal(formatGradeAvg(75), '75%')
  })

  it('computePercent and formatScoreWithPercent format raw scores', () => {
    assert.equal(computePercent(42, 50), 84)
    assert.equal(formatScoreWithPercent(42, 50), '42/50 (84%)')
    assert.equal(formatScoreWithPercent(undefined, 50), '—')
    assert.equal(formatScoreWithPercent(0, 50), '0/50 (0%)')
  })

  it('countGradedSubmissions counts graded, expired, and completed rows', () => {
    const summary = countGradedSubmissions([
      { status: 'graded', score: 10 },
      { status: 'expired', score: 0 },
      { status: 'completed', score: 8 },
      { status: 'submitted', score: null },
    ])
    assert.equal(summary.graded, 3)
    assert.equal(summary.total, 4)
  })
})
