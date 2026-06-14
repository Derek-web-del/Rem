import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fetchComponentsForWorkType, validateGradeComponentForWork } from '../server/lib/subjectGradeCriteriaDb.js'

function mockPool(rowsByQuery) {
  return {
    query: async (sql, params) => {
      const key = String(sql).replace(/\s+/g, ' ').trim()
      if (rowsByQuery[key]) return rowsByQuery[key](params)
      if (key.includes('CREATE TABLE') || key.includes('ALTER TABLE') || key.includes('INSERT INTO subject_grade_components')) {
        return { rows: [] }
      }
      if (key.includes('SELECT id FROM subject_grade_components WHERE subject_id')) {
        return { rows: [{ id: 1 }] }
      }
      if (key.includes('SELECT * FROM subject_grade_components WHERE subject_id')) {
        return {
          rows: [
            {
              id: 1,
              subject_id: 10,
              name: 'Quizzes',
              percentage: 15,
              color: '#8B5CF6',
              component_order: 0,
              maps_to_assignment: false,
              maps_to_activity: false,
              is_quiz: true,
            },
            {
              id: 2,
              subject_id: 10,
              name: 'Written Work',
              percentage: 25,
              color: '#3B82F6',
              component_order: 1,
              maps_to_assignment: true,
              maps_to_activity: false,
              is_quiz: false,
            },
          ],
        }
      }
      if (key.includes('SELECT * FROM subject_grade_components WHERE id =')) {
        const id = Number(params[0])
        const map = {
          1: {
            id: 1,
            subject_id: 10,
            name: 'Quizzes',
            percentage: 15,
            color: '#8B5CF6',
            component_order: 0,
            maps_to_assignment: false,
            maps_to_activity: false,
            is_quiz: true,
          },
          2: {
            id: 2,
            subject_id: 10,
            name: 'Written Work',
            percentage: 25,
            color: '#3B82F6',
            component_order: 1,
            maps_to_assignment: true,
            maps_to_activity: false,
            is_quiz: false,
          },
        }
        return { rows: map[id] ? [map[id]] : [] }
      }
      return { rows: [] }
    },
  }
}

describe('subjectGradeCriteria quiz work type', () => {
  it('fetchComponentsForWorkType returns is_quiz components for quiz', async () => {
    const pool = mockPool({})
    const rows = await fetchComponentsForWorkType(pool, 10, 'quiz')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].name, 'Quizzes')
    assert.equal(rows[0].is_quiz, true)
  })

  it('validateGradeComponentForWork accepts quiz on is_quiz component', async () => {
    const pool = mockPool({})
    const ok = await validateGradeComponentForWork(pool, 10, 1, 'quiz')
    assert.equal(ok.ok, true)
  })

  it('validateGradeComponentForWork rejects quiz on non-quiz component', async () => {
    const pool = mockPool({})
    const bad = await validateGradeComponentForWork(pool, 10, 2, 'quiz')
    assert.equal(bad.ok, false)
    assert.match(bad.message, /cannot be used for quizzes/i)
  })
})
