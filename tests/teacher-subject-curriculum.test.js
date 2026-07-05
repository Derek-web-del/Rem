import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  criteriaToArray,
  validateComponentsPayload,
  validateGradeCriteriaPercents,
} from '../server/lib/subjectGradeCriteriaDb.js'
import { listenTestServer, teardownTestApp } from './helpers/teardown-test-app.js'

describe('subjectGradeCriteriaDb validation', () => {
  it('rejects percentages not summing to 100', () => {
    const bad = validateGradeCriteriaPercents({
      written_work_pct: 30,
      performance_task_pct: 30,
      quizzes_pct: 30,
      activities_pct: 30,
    })
    assert.equal(bad.ok, false)
    assert.match(bad.message, /sum to 100%/)
  })

  it('accepts percentages summing to 100', () => {
    const good = validateGradeCriteriaPercents({
      written_work_pct: 25,
      performance_task_pct: 45,
      quizzes_pct: 15,
      activities_pct: 15,
    })
    assert.equal(good.ok, true)
    assert.equal(good.written_work_pct, 25)
    assert.equal(good.performance_task_pct, 45)
    assert.equal(good.quizzes_pct, 15)
    assert.equal(good.activities_pct, 15)
  })

  it('criteriaToArray returns four components', () => {
    const arr = criteriaToArray({ written_work_pct: 25, performance_task_pct: 45, quizzes_pct: 15, activities_pct: 15 })
    assert.equal(arr.length, 4)
    assert.equal(arr.reduce((s, r) => s + r.percentage, 0), 100)
  })

  it('rejects out-of-range percentages', () => {
    const bad = validateGradeCriteriaPercents({
      written_work_pct: -1,
      performance_task_pct: 50,
      quizzes_pct: 25,
      activities_pct: 26,
    })
    assert.equal(bad.ok, false)
  })

  it('validateComponentsPayload accepts valid dynamic components', () => {
    const result = validateComponentsPayload([
      {
        name: 'Written Work',
        percentage: 25,
        color: '#3B82F6',
        maps_to_assignment: true,
        maps_to_activity: false,
        is_quiz: false,
      },
      {
        name: 'Performance Task',
        percentage: 45,
        color: '#F59E0B',
        maps_to_assignment: true,
        maps_to_activity: true,
        is_quiz: false,
      },
      {
        name: 'Quizzes',
        percentage: 15,
        color: '#8B5CF6',
        maps_to_assignment: false,
        maps_to_activity: false,
        is_quiz: true,
      },
      {
        name: 'Activities',
        percentage: 15,
        color: '#10B981',
        maps_to_assignment: false,
        maps_to_activity: true,
        is_quiz: false,
      },
    ])
    assert.equal(result.ok, true)
  })

  it('validateComponentsPayload rejects duplicate names', () => {
    const result = validateComponentsPayload([
      { name: 'A', percentage: 50, maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
      { name: 'A', percentage: 35, maps_to_assignment: false, maps_to_activity: true, is_quiz: false },
      { name: 'Quizzes', percentage: 15, maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
    ])
    assert.equal(result.ok, false)
    assert.match(String(result.message || ''), /Duplicate component name/i)
  })

  it('validateComponentsPayload accepts criteria without any quiz-mapped component', () => {
    const result = validateComponentsPayload([
      { name: 'Written Work', percentage: 50, maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
      { name: 'Performance Task', percentage: 50, maps_to_assignment: true, maps_to_activity: true, is_quiz: false },
    ])
    assert.equal(result.ok, true)
  })

  it('reorderTopicList keeps uncategorized first', async () => {
    const { reorderTopicList } = await import(
      '../Frontend/src/pages/teachers/subject-detail/shared/classworkDragDrop.js'
    )
    const topics = [
      { id: 'uncategorized', title: 'Uncategorized' },
      { id: '1', title: 'Lesson 1' },
      { id: '2', title: 'Lesson 2' },
    ]
    const next = reorderTopicList(topics, '2', '1')
    assert.deepEqual(next.map((t) => t.id), ['uncategorized', '2', '1'])
  })

  it('encodeTopicDragPlain and parsePlainDragPayload round-trip topic id', async () => {
    const { encodeTopicDragPlain, parsePlainDragPayload } = await import(
      '../Frontend/src/pages/teachers/subject-detail/shared/classworkDragDrop.js'
    )
    const plain = encodeTopicDragPlain({ id: 'topic-42' })
    assert.equal(plain, 'topic:topic-42')
    const parsed = parsePlainDragPayload(plain)
    assert.deepEqual(parsed, { kind: 'topic', payload: { topicId: 'topic-42' } })
  })

  it('encodeItemDragPlain and parsePlainDragPayload round-trip item payload', async () => {
    const { encodeItemDragPlain, parsePlainDragPayload, parseDragPayload } = await import(
      '../Frontend/src/pages/teachers/subject-detail/shared/classworkDragDrop.js'
    )
    const payload = { itemType: 'quiz', itemId: 7 }
    const plain = encodeItemDragPlain(payload)
    assert.equal(plain, 'item:{"itemType":"quiz","itemId":7}')
    const parsed = parsePlainDragPayload(plain)
    assert.deepEqual(parsed, { kind: 'item', payload })
    assert.deepEqual(parseDragPayload(plain), payload)
  })

  it('validateComponentsPayload accepts custom component with is_quiz only', () => {
    const result = validateComponentsPayload([
      { name: 'Written Work', percentage: 70, maps_to_assignment: true, maps_to_activity: false, is_quiz: false },
      { name: 'Oral Quiz', percentage: 30, maps_to_assignment: false, maps_to_activity: false, is_quiz: true },
    ])
    assert.equal(result.ok, true)
  })
})

describe('teacher subject curriculum API auth gate', () => {
  it('POST /api/teacher/subjects/:id/modules requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `curriculum-mod-post-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/modules`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Module 1' }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PUT /api/teacher/subjects/:id/grade-criteria requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `curriculum-crit-put-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/grade-criteria`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          written_work_pct: 25,
          performance_task_pct: 45,
          quizzes_pct: 15,
          activities_pct: 15,
        }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/teacher/items/move requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `curriculum-move-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/items/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item_type: 'assignment', item_id: 1, module_id: 2 }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('POST /api/teacher/assignments requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `assign-post-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/assignments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Test', subject_id: 1, subject_name: 'Math', grade_level: 'Grade 7' }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/teacher/subjects/:id/topics/reorder requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `topics-reorder-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/topics/reorder`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic_ids: ['1', '2'] }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('PATCH /api/teacher/assignments/:id/status requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `curriculum-pub-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/assignments/1/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'draft' }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('subjectCurriculumDb lessons', () => {
  it('POST lesson route requires faculty session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `lesson-post-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/teacher/subjects/1/topics/1/lessons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Lesson 1' }),
      })
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('student stream API auth gate', () => {
  it('GET /api/v1/student/subjects/:id/modules requires student session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `student-modules-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/student/subjects/1/modules`)
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })

  it('GET /api/v1/student/subjects/:id/stream requires student session', async () => {
    process.env.AUTH_MODULE_INSTANCE = `student-stream-${Date.now()}`
    const { createApp } = await import('../server/index.js')
    const app = await createApp()
    const server = await listenTestServer(app)
    const port = server.address().port
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/v1/student/subjects/1/stream`)
      assert.equal(res.status, 401)
      const json = await res.json()
      assert.equal(json.error, 'UNAUTHORIZED')
    } finally {
      await teardownTestApp(server, app)
    }
  })
})

describe('subjectCurriculumDb item status', () => {
  it('updateCurriculumItemStatus rejects invalid status', async () => {
    const { updateCurriculumItemStatus } = await import('../server/lib/subjectCurriculumDb.js')
    const result = await updateCurriculumItemStatus(null, 'assignment', 1, 'hidden')
    assert.equal(result.ok, false)
  })

  it('moveCurriculumItem rejects invalid item type', async () => {
    const { moveCurriculumItem } = await import('../server/lib/subjectCurriculumDb.js')
    const result = await moveCurriculumItem(null, { item_type: 'bad', item_id: 1 })
    assert.equal(result.ok, false)
  })
})

describe('subjectCurriculumDb topic id resolution', () => {
  it('normalizeTopicIdInput maps uncategorized and empty to null', async () => {
    const { normalizeTopicIdInput } = await import('../server/lib/subjectCurriculumDb.js')
    assert.equal(normalizeTopicIdInput('uncategorized'), null)
    assert.equal(normalizeTopicIdInput(''), null)
    assert.equal(normalizeTopicIdInput(null), null)
    assert.equal(normalizeTopicIdInput('42'), '42')
  })
})
