import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  clampScore,
  computeClassAverages,
  computeComponentAvgFromPoints,
  computeFinalGrade,
  computeStudentGradeRow,
  gradeRemarks,
  groupItemsByComponent,
  itemKey,
} from '../server/lib/gradebookCalc.js'

describe('gradebookCalc', () => {
  const components = [
    { id: '1', name: 'Written Work', percentage: 25, maps_to_assignment: true, is_quiz: false },
    { id: '2', name: 'Quizzes', percentage: 15, is_quiz: true, maps_to_assignment: false },
  ]

  const items = [
    { id: 10, type: 'assignment', max_points: 100, grade_component_id: 1 },
    { id: 20, type: 'quiz', max_points: 50, grade_component_id: null },
  ]

  it('computeComponentAvgFromPoints uses points-weighted formula', () => {
    const avg = computeComponentAvgFromPoints([items[0]], () => 80)
    assert.equal(avg, 80)
    const mixed = computeComponentAvgFromPoints(
      [{ max_points: 100 }, { max_points: 50 }],
      (item) => (Number(item.max_points) === 100 ? 100 : 0),
    )
    assert.equal(mixed, Math.round((100 / 150) * 100))
  })

  it('missing scores count as zero toward possible points', () => {
    const avg = computeComponentAvgFromPoints([{ max_points: 100 }], () => 0)
    assert.equal(avg, 0)
  })

  it('computeFinalGrade weights all components', () => {
    const final = computeFinalGrade(components, { '1': 80, '2': 60 })
    assert.equal(final, 0.25 * 80 + 0.15 * 60)
  })

  it('groupItemsByComponent assigns quizzes to is_quiz component', () => {
    const grouped = groupItemsByComponent(components, items)
    assert.equal(grouped['1'].length, 1)
    assert.equal(grouped['2'].length, 1)
    assert.equal(grouped['2'][0].type, 'quiz')
  })

  it('groupItemsByComponent prefers explicit quiz grade_component_id', () => {
    const multiQuizComponents = [
      { id: '1', name: 'Written Work', percentage: 25, maps_to_assignment: true, is_quiz: false },
      { id: '2', name: 'Quizzes', percentage: 10, is_quiz: true, maps_to_assignment: false },
      { id: '3', name: 'Major Exam', percentage: 15, is_quiz: true, maps_to_assignment: false },
    ]
    const quizItems = [
      { id: 30, type: 'quiz', max_points: 40, grade_component_id: 3 },
      { id: 31, type: 'quiz', max_points: 20, grade_component_id: null },
    ]
    const grouped = groupItemsByComponent(multiQuizComponents, quizItems)
    assert.equal(grouped['3'].length, 1)
    assert.equal(grouped['3'][0].id, 30)
    assert.equal(grouped['2'].length, 1)
    assert.equal(grouped['2'][0].id, 31)
  })

  it('groupItemsByComponent leaves unlinked assignments ungrouped', () => {
    const orphanItems = [
      { id: 10, type: 'assignment', max_points: 100, grade_component_id: null },
      { id: 20, type: 'quiz', max_points: 50, grade_component_id: null },
    ]
    const grouped = groupItemsByComponent(components, orphanItems)
    assert.equal(grouped['1'].length, 0)
    assert.equal(grouped['2'].length, 1)
    assert.equal(grouped['2'][0].id, 20)
  })

  it('computeStudentGradeRow returns component avgs and final', () => {
    const grouped = groupItemsByComponent(components, items)
    const scores = {
      [itemKey('assignment', 10)]: 90,
      [itemKey('quiz', 20)]: 25,
    }
    const row = computeStudentGradeRow(components, grouped, scores)
    assert.equal(row.componentAvgs['1'], 90)
    assert.equal(row.componentAvgs['2'], 50)
    assert.ok(row.finalGrade > 0)
  })

  it('computeClassAverages averages columns and finals', () => {
    const students = [{ id: 1 }, { id: 2 }]
    const grouped = groupItemsByComponent(components, items)
    const scoresMap = {
      '1': { [itemKey('assignment', 10)]: 80, [itemKey('quiz', 20)]: 40 },
      '2': { [itemKey('assignment', 10)]: 60, [itemKey('quiz', 20)]: 30 },
    }
    const cls = computeClassAverages(students, components, grouped, scoresMap, items)
    assert.equal(cls.columnAvgs[itemKey('assignment', 10)], 70)
    assert.ok(cls.finalGrade > 0)
  })

  it('clampScore respects max points', () => {
    assert.equal(clampScore(150, 100), 100)
    assert.equal(clampScore(-5, 100), 0)
  })

  it('gradeRemarks uses specified thresholds', () => {
    assert.equal(gradeRemarks(92), 'Excellent')
    assert.equal(gradeRemarks(87), 'Very Good')
    assert.equal(gradeRemarks(82), 'Good')
    assert.equal(gradeRemarks(76), 'Satisfactory')
    assert.equal(gradeRemarks(70), 'Needs Improvement')
  })
})
