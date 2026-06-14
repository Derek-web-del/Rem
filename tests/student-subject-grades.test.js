import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeComponentAvgFromPoints } from '../server/lib/gradebookCalc.js'
import { buildComponentWorkGroups } from '../Frontend/src/lib/gradeComponentWorkGroups.js'

describe('student subject grades alignment', () => {
  it('points-weighted component avg is not mean of percents', () => {
    const avg = computeComponentAvgFromPoints(
      [{ max_points: 100 }, { max_points: 50 }],
      (item) => (Number(item.max_points) === 100 ? 80 : 0),
    )
    assert.equal(avg, Math.round((80 / 150) * 100))
    assert.notEqual(avg, 40)
  })

  it('buildComponentWorkGroups assigns quiz by grade_component_id', () => {
    const components = [
      { id: '1', name: 'Quizzes', percentage: 15, is_quiz: true },
      { id: '2', name: 'Major Exam', percentage: 15, is_quiz: true },
    ]
    const quizzes = [
      {
        id: 10,
        title: 'Q1',
        score: 8,
        max_score: 10,
        submission_id: 1,
        entity_id: 10,
        entity_type: 'quiz',
        grade_component_id: 2,
      },
      {
        id: 11,
        title: 'Q2',
        score: 5,
        max_score: 10,
        submission_id: 2,
        entity_id: 11,
        entity_type: 'quiz',
        grade_component_id: null,
      },
    ]
    const groups = buildComponentWorkGroups(components, quizzes, [], [])
    const major = groups.find((g) => String(g.comp.id) === '2')
    const regular = groups.find((g) => String(g.comp.id) === '1')
    assert.equal(major?.items.length, 1)
    assert.equal(major?.items[0].title, 'Q1')
    assert.equal(regular?.items.length, 1)
    assert.equal(regular?.items[0].title, 'Q2')
  })
})
