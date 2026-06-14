import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { diffRecords, diffQuizQuestions, sanitizeAuditRecord } from '../server/lib/teacherAuditLog.js'
import { mapLedgerRowToAuthEvent } from '../server/lib/auditLogsLedger.js'

describe('teacherAuditLog', () => {
  it('diffRecords returns only changed fields', () => {
    const result = diffRecords(
      { title: 'Assignment 1', due_date: '2026-06-15', score: 10 },
      { title: 'Assignment 1', due_date: '2026-06-30', score: 10 },
    )
    assert.deepEqual(result.changed_fields, ['due_date'])
    assert.deepEqual(result.old_values, { due_date: '2026-06-15' })
    assert.deepEqual(result.new_values, { due_date: '2026-06-30' })
  })

  it('sanitizeAuditRecord redacts sensitive fields and large blobs', () => {
    const out = sanitizeAuditRecord({
      title: 'Quiz 1',
      quiz_password: 'secret',
      notes: `data:image/png;base64,${'x'.repeat(600)}`,
    })
    assert.equal(out.title, 'Quiz 1')
    assert.equal(out.quiz_password, '[redacted]')
    assert.equal(out.notes, '[file omitted]')
  })

  it('diffQuizQuestions detects added and edited questions', () => {
    const oldQuiz = {
      title: 'Midterm',
      parts: [{ questions: [{ id: 1, question_text: 'Q1', question_type: 'mc', points: 1, order_index: 0 }] }],
    }
    const newQuiz = {
      title: 'Midterm',
      parts: [
        {
          questions: [
            { id: 1, question_text: 'Q1 updated', question_type: 'mc', points: 2, order_index: 0 },
            { id: 2, question_text: 'Q2', question_type: 'mc', points: 1, order_index: 1 },
          ],
        },
      ],
    }
    const events = diffQuizQuestions(oldQuiz, newQuiz)
    assert.ok(events.some((e) => e.event_type === 'quiz_question_edited'))
    assert.ok(events.some((e) => e.event_type === 'quiz_question_added'))
  })

  it('mapLedgerRowToAuthEvent prefers dedicated column values', () => {
    const mapped = mapLedgerRowToAuthEvent({
      id: 42,
      type: 'ASSIGNMENT_UPDATED',
      payload: { userId: 'legacy' },
      created_at: '2026-06-14T10:00:00.000Z',
      event_type: 'assignment_updated',
      module: 'Assignments',
      action: 'Edit',
      performed_by: 'user-1',
      performed_by_name: 'Jane Teacher',
      target_id: '99',
      target_label: 'Assignment 1 — English 10',
      old_values: { due_date: '2026-06-15' },
      new_values: { due_date: '2026-06-30' },
      changed_fields: ['due_date'],
      user_agent: 'Mozilla/5.0 Test',
    })
    assert.equal(mapped.eventData.module, 'Assignments')
    assert.equal(mapped.eventData.action, 'Edit')
    assert.equal(mapped.eventData.performed_by_name, 'Jane Teacher')
    assert.equal(mapped.eventData.target_label, 'Assignment 1 — English 10')
    assert.deepEqual(mapped.eventData.old_values, { due_date: '2026-06-15' })
    assert.deepEqual(mapped.eventData.new_values, { due_date: '2026-06-30' })
    assert.deepEqual(mapped.eventData.changed_fields, ['due_date'])
    assert.equal(mapped.eventData.user_agent, 'Mozilla/5.0 Test')
    assert.equal(mapped.eventData.detailedDiffs.due_date.before, '2026-06-15')
    assert.equal(mapped.eventData.detailedDiffs.due_date.after, '2026-06-30')
  })
})
