import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  averagePercents,
  buildGradedComponentSummary,
  componentHasGrades,
  fetchFacultySubjectsForGrade,
  fetchSectionSubjectGradesMatrix,
  fetchStudentGradesBySubject,
  normalizeGradeFetchOptions,
  safeGrade,
  sanitizeGradeSummary,
} from '../server/lib/gradesDb.js'
import { computeComponentAvgFromPoints } from '../server/lib/gradebookCalc.js'

describe('gradesDb zero-default', () => {
  it('averagePercents returns 0 for empty input', () => {
    assert.equal(averagePercents([]), 0)
    assert.equal(averagePercents([{ percent: null }, { percent: undefined }]), 0)
  })

  it('averagePercents computes mean for valid percents', () => {
    assert.equal(averagePercents([{ percent: 80 }, { percent: 60 }]), 70)
    assert.equal(averagePercents([{ percent: 0 }]), 0)
  })

  it('safeGrade coerces null/undefined/NaN to 0', () => {
    assert.equal(safeGrade(null), 0)
    assert.equal(safeGrade(undefined), 0)
    assert.equal(safeGrade(''), 0)
    assert.equal(safeGrade('bad'), 0)
    assert.equal(safeGrade(75), 75)
  })

  it('sanitizeGradeSummary zero-fills averages and sets has_scored_items', () => {
    const empty = sanitizeGradeSummary({
      overall_avg: null,
      quiz_avg: null,
      assignment_avg: null,
      activity_avg: null,
      quizzes: [],
      assignments: [],
      activities: [],
    })
    assert.equal(empty.overall_avg, 0)
    assert.equal(empty.quiz_avg, 0)
    assert.equal(empty.assignment_avg, 0)
    assert.equal(empty.activity_avg, 0)
    assert.equal(empty.has_scored_items, false)

    const withItems = sanitizeGradeSummary({
      overall_avg: 82,
      quiz_avg: 90,
      assignment_avg: null,
      activity_avg: 70,
      quizzes: [{ percent: 90 }],
      assignments: [],
      activities: [{ percent: 70 }],
    })
    assert.equal(withItems.overall_avg, 82)
    assert.equal(withItems.assignment_avg, 0)
    assert.equal(withItems.has_scored_items, true)
  })
})

describe('buildGradedComponentSummary renormalized weights', () => {
  const criteria = {
    components: [
      { id: 1, name: 'Activities', percentage: 15, maps_to_assignment: false, maps_to_activity: true, is_quiz: false },
      { id: 2, name: 'Performance Task', percentage: 40, maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
      { id: 3, name: 'Quizzes', percentage: 15, maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
      { id: 4, name: 'Written Work', percentage: 30, maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
    ],
  }

  it('single graded component at 100% yields overall 100%', () => {
    const activities = [{ percent: 100, grade_component_id: 1 }]
    const result = buildGradedComponentSummary([], [], activities, criteria)
    assert.equal(result.overall_avg, 100)
    assert.equal(result.graded_weight_total, 15)
    assert.deepEqual(result.graded_component_ids, ['1'])
  })

  it('two graded components (15% + 40%) at 100% and 50% yields overall 64%', () => {
    const activities = [{ percent: 100, grade_component_id: 1 }]
    const assignments = [{ percent: 50, grade_component_id: 2 }]
    const result = buildGradedComponentSummary([], assignments, activities, criteria)
    assert.equal(result.overall_avg, 64)
    assert.equal(result.graded_weight_total, 55)
    assert.equal(result.graded_components_count, 2)
  })

  it('no graded components yields overall 0', () => {
    const result = buildGradedComponentSummary([], [], [], criteria)
    assert.equal(result.overall_avg, 0)
    assert.equal(result.graded_weight_total, 0)
    assert.equal(result.graded_components_count, 0)
  })

  it('ungraded component is excluded from graded_weight_total', () => {
    const activities = [{ percent: 80, grade_component_id: 1 }]
    const result = buildGradedComponentSummary([], [], activities, criteria)
    assert.equal(result.graded_weight_total, 15)
    assert.ok(!result.graded_component_ids.includes('4'))
    assert.ok(!result.graded_component_ids.includes('3'))
  })

  it('points-weighted avg differs from mean of percents for mixed max points', () => {
    const pointsWeighted = computeComponentAvgFromPoints(
      [{ max_points: 100 }, { max_points: 50 }],
      (item) => (Number(item.max_points) === 100 ? 80 : 0),
    )
    assert.equal(pointsWeighted, Math.round((80 / 150) * 100))
    assert.notEqual(pointsWeighted, 40)
  })

  it('componentHasGrades detects quiz and linked work', () => {
    const quizComp = criteria.components[2]
    const actComp = criteria.components[0]
    assert.equal(componentHasGrades(quizComp, [{ percent: 90 }], [], []), true)
    assert.equal(componentHasGrades(quizComp, [], [], []), false)
    assert.equal(componentHasGrades(actComp, [], [], [{ percent: 100, grade_component_id: 1 }]), true)
    assert.equal(componentHasGrades(actComp, [], [], [{ percent: 100, grade_component_id: 99 }]), false)
  })
})

describe('gradesDb faculty scoping', () => {
  it('normalizeGradeFetchOptions does not scope when facultyId is missing', () => {
    const opts = normalizeGradeFetchOptions({ subjectId: null, facultyId: null })
    assert.equal(opts.subFilter, null)
    assert.equal(opts.facultyFilter, null)
    assert.equal(opts.scopeToFaculty, false)

    const empty = normalizeGradeFetchOptions({ facultyId: '  ' })
    assert.equal(empty.facultyFilter, null)
    assert.equal(empty.scopeToFaculty, false)
  })

  it('normalizeGradeFetchOptions enables scoping for valid facultyId', () => {
    const opts = normalizeGradeFetchOptions({ facultyId: 'fac-42' })
    assert.equal(opts.facultyFilter, 'fac-42')
    assert.equal(opts.scopeToFaculty, true)
  })

  it('normalizeGradeFetchOptions parses subjectId filter', () => {
    const opts = normalizeGradeFetchOptions({ subjectId: '7', facultyId: 'fac-1' })
    assert.equal(opts.subFilter, 7)
    assert.equal(opts.facultyFilter, 'fac-1')
    assert.equal(opts.scopeToFaculty, true)

    const invalid = normalizeGradeFetchOptions({ subjectId: 'bad' })
    assert.equal(invalid.subFilter, null)
    assert.equal(invalid.scopeToFaculty, false)
  })
})

describe('fetchSectionSubjectGradesMatrix', () => {
  function mockPool({ sectionGrade = 'grade 7', subjects = [], students = [] } = {}) {
    return {
      query: async (sql, params) => {
        const text = String(sql)
        if (text.includes('information_schema')) return { rows: [] }
        if (text.includes('FROM sections')) {
          return { rows: sectionGrade != null ? [{ grade_level: sectionGrade }] : [] }
        }
        if (text.includes('faculty_id::text =')) {
          assert.equal(params[0], '42')
          assert.equal(params[1], 'grade 7')
          return { rows: subjects }
        }
        if (text.includes('FROM subjects')) {
          return { rows: [] }
        }
        if (text.includes('FROM students')) {
          return { rows: students }
        }
        return { rows: [] }
      },
    }
  }

  it('returns empty matrix for invalid section id', async () => {
    const pool = mockPool()
    const result = await fetchSectionSubjectGradesMatrix(pool, 0, { facultyId: '42' })
    assert.deepEqual(result, { grade_level: '', subjects: [], students: [] })
  })

  it('returns empty subjects when section has no grade level', async () => {
    const pool = mockPool({ sectionGrade: '' })
    const result = await fetchSectionSubjectGradesMatrix(pool, 5, { facultyId: '42' })
    assert.equal(result.grade_level, '')
    assert.deepEqual(result.subjects, [])
    assert.deepEqual(result.students, [])
  })

  it('returns empty subjects when facultyId is missing', async () => {
    const pool = mockPool()
    const result = await fetchSectionSubjectGradesMatrix(pool, 5, { facultyId: null })
    assert.equal(result.grade_level, 'grade 7')
    assert.deepEqual(result.subjects, [])
    assert.deepEqual(result.students, [])
  })

  it('returns faculty subjects for section grade level and student rows', async () => {
    const pool = mockPool({
      subjects: [
        { id: 1, subject_code: 'MATH7', subject_name: 'Math', grade_level: 'Grade 7' },
        { id: 2, subject_code: 'SCI7', subject_name: 'Science', grade_level: 'Grade 7' },
      ],
      students: [{ id: 10, first_name: 'Juan', middle_name: null, last_name: 'Cruz' }],
    })
    const result = await fetchSectionSubjectGradesMatrix(pool, 5, { facultyId: '42' })
    assert.equal(result.grade_level, 'grade 7')
    assert.equal(result.subjects.length, 2)
    assert.equal(result.subjects[0].subject_name, 'Math')
    assert.equal(result.students.length, 1)
    assert.equal(result.students[0].student_name, 'Juan Cruz')
    assert.deepEqual(Object.keys(result.students[0].subject_grades).sort(), ['1', '2'])
    assert.equal(result.students[0].subject_grades['1'].has_scored_items, false)
    assert.equal(result.students[0].subject_grades['1'].overall_avg, null)
  })
})

describe('fetchFacultySubjectsForGrade', () => {
  function mockPool({ subjects = [] } = {}) {
    return {
      query: async (sql, params) => {
        const text = String(sql)
        if (text.includes('information_schema')) return { rows: [] }
        if (text.includes('faculty_id::text =')) {
          return { rows: subjects }
        }
        return { rows: [] }
      },
    }
  }

  it('returns empty list when facultyId or grade level is missing', async () => {
    const pool = mockPool()
    assert.deepEqual(await fetchFacultySubjectsForGrade(pool, '', 'grade 10'), [])
    assert.deepEqual(await fetchFacultySubjectsForGrade(pool, '42', ''), [])
  })

  it('returns faculty-owned subjects for grade level', async () => {
    const pool = mockPool({
      subjects: [
        { id: 3, subject_code: 'MATH10', subject_name: 'Math', grade_level: 'Grade 10', semester: '1' },
      ],
    })
    const rows = await fetchFacultySubjectsForGrade(pool, '42', 'grade 10')
    assert.equal(rows.length, 1)
    assert.equal(rows[0].subject_name, 'Math')
    assert.equal(rows[0].id, 3)
  })
})

describe('fetchStudentGradesBySubject faculty scoping', () => {
  const studentRow = { id: 10, grade_level: 'Grade 10', section_id: 5 }

  function mockPool({ facultySubjects = [], allGradeSubjects = [] } = {}) {
    return {
      query: async (sql, params) => {
        const text = String(sql)
        if (text.includes('information_schema')) return { rows: [] }
        if (text.includes('faculty_id::text =') && text.includes('FROM subjects')) {
          return { rows: facultySubjects }
        }
        if (text.includes('FROM subjects') && text.includes(' IN (')) {
          return { rows: allGradeSubjects }
        }
        if (text.includes('FROM subjects WHERE id = $1 AND faculty_id')) {
          const subjectId = Number(params[0])
          const facultyId = String(params[1])
          const owned = facultySubjects.some(
            (s) => Number(s.id) === subjectId && facultyId === 'teacher-b',
          )
          return { rows: owned ? [{ id: subjectId }] : [] }
        }
        return { rows: [] }
      },
    }
  }

  it('returns empty subjects when faculty has no assigned subjects', async () => {
    const pool = mockPool({ facultySubjects: [] })
    const result = await fetchStudentGradesBySubject(pool, 10, studentRow, { facultyId: 'teacher-b' })
    assert.deepEqual(result.subjects, [])
    assert.equal(result.has_any_scores, false)
  })

  it('does not include other teachers subjects when facultyId is set', async () => {
    const pool = mockPool({
      facultySubjects: [],
      allGradeSubjects: [
        { id: 99, subject_code: 'SCI10', subject_name: 'Science', grade_level: 'Grade 10', semester: '1' },
      ],
    })
    const result = await fetchStudentGradesBySubject(pool, 10, studentRow, { facultyId: 'teacher-b' })
    assert.deepEqual(result.subjects, [])
  })

  it('without facultyId queries all grade-level subjects (not faculty-scoped)', async () => {
    let usedGradeLevelInQuery = false
    const pool = {
      query: async (sql) => {
        const text = String(sql)
        if (text.includes('information_schema')) return { rows: [] }
        if (text.includes('FROM subjects') && text.includes(' IN (')) {
          usedGradeLevelInQuery = true
          return {
            rows: [
              { id: 1, subject_code: 'MATH10', subject_name: 'Math', grade_level: 'Grade 10', semester: '1' },
            ],
          }
        }
        return { rows: [] }
      },
    }
    await fetchStudentGradesBySubject(pool, 10, studentRow)
    assert.equal(usedGradeLevelInQuery, true)
  })
})
