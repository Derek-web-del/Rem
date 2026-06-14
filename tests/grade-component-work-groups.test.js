import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildComponentWorkGroups, entityTypeLabel } from '../Frontend/src/lib/gradeComponentWorkGroups.js'
import { mergeIncludedComponentForWorkType } from '../server/lib/subjectGradeCriteriaDb.js'

describe('buildComponentWorkGroups', () => {
  const components = [
    { id: '1', name: 'Written Work', percentage: 40, color: '#3B82F6', maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
    { id: '2', name: 'Performance Task', percentage: 25, color: '#F59E0B', maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
    { id: '3', name: 'Quizzes', percentage: 15, color: '#8B5CF6', maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
  ]

  it('groups assignments and activities by grade_component_id regardless of maps_to flags', () => {
    const assignments = [
      { title: 'TAKDANG ARALIN 1', grade_component_id: 1, entity_type: 'assignment', submission_id: 10, score: 85, max_score: 100 },
    ]
    const activities = [
      { title: 'English 1 Activity', grade_component_id: 2, entity_type: 'activity', submission_id: 20, score: 50, max_score: 100 },
    ]

    const groups = buildComponentWorkGroups(components, [], assignments, activities)

    assert.equal(groups.length, 2)
    assert.equal(groups[0].comp.name, 'Written Work')
    assert.equal(groups[0].items[0].title, 'TAKDANG ARALIN 1')
    assert.equal(groups[1].comp.name, 'Performance Task')
    assert.equal(groups[1].items[0].title, 'English 1 Activity')
  })

  it('places custom component items even when maps_to_activity is false', () => {
    const customComponents = [
      { id: '9', name: 'Custom Lab', percentage: 20, color: '#10B981', maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
    ]
    const activities = [
      { title: 'Lab Report', grade_component_id: 9, entity_type: 'activity', submission_id: 30, score: 90, max_score: 100 },
    ]

    const groups = buildComponentWorkGroups(customComponents, [], [], activities)

    assert.equal(groups.length, 1)
    assert.equal(groups[0].comp.name, 'Custom Lab')
    assert.equal(groups[0].items[0].title, 'Lab Report')
  })

  it('attaches quizzes to the is_quiz component', () => {
    const quizzes = [
      { title: 'Quiz 1', entity_type: 'quiz', submission_id: 40, score: 8, max_score: 10 },
    ]

    const groups = buildComponentWorkGroups(components, quizzes, [], [])

    assert.equal(groups.length, 1)
    assert.equal(groups[0].comp.name, 'Quizzes')
    assert.equal(groups[0].items[0].title, 'Quiz 1')
  })

  it('puts unlinked items in Other graded work', () => {
    const assignments = [
      { title: 'Orphan', grade_component_id: null, entity_type: 'assignment', submission_id: 50, score: 70, max_score: 100 },
    ]

    const groups = buildComponentWorkGroups(components, [], assignments, [])

    assert.equal(groups.length, 1)
    assert.equal(groups[0].comp.name, 'Other graded work')
    assert.equal(groups[0].items[0].title, 'Orphan')
  })
})

describe('entityTypeLabel', () => {
  it('returns labels for known entity types', () => {
    assert.equal(entityTypeLabel('assignment'), 'Assignment')
    assert.equal(entityTypeLabel('activity'), 'Activity')
    assert.equal(entityTypeLabel('quiz'), 'Quiz')
  })
})

describe('mergeIncludedComponentForWorkType', () => {
  const filtered = [{ id: '1', name: 'Activities', percentage: 15, maps_to_activity: true, maps_to_assignment: false, is_quiz: false }]

  it('appends included row when missing from filtered list', () => {
    const merged = mergeIncludedComponentForWorkType(filtered, 99, {
      id: 99,
      name: 'Performance Task',
      percentage: 25,
      color: '#F59E0B',
      component_order: 1,
      maps_to_assignment: true,
      maps_to_activity: false,
      is_quiz: false,
    })

    assert.equal(merged.length, 2)
    assert.equal(merged[1].id, '99')
    assert.equal(merged[1].name, 'Performance Task')
  })

  it('does not duplicate when already present', () => {
    const merged = mergeIncludedComponentForWorkType(filtered, 1, {
      id: 1,
      name: 'Activities',
      percentage: 15,
      color: '#10B981',
      component_order: 0,
      maps_to_assignment: false,
      maps_to_activity: true,
      is_quiz: false,
    })

    assert.equal(merged.length, 1)
  })
})
