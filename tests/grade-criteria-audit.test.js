import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  computeGradeCriteriaDetailedDiffs,
  dedupeComponentsForAudit,
  extractComponentsFromAuditValues,
  hasScalarDetailedDiffs,
  isGradeCriteriaAuditEvent,
  resolveGradeCriteriaAuditDisplay,
  summarizeGradeCriteriaComponents,
} from '../shared/gradeCriteriaAudit.js'

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

  it('detects grade criteria events from multiple tokens', () => {
    assert.equal(isGradeCriteriaAuditEvent({ event_type: 'grade_criteria_saved' }), true)
    assert.equal(isGradeCriteriaAuditEvent({ type: 'GRADE_CRITERIA_SAVED' }), true)
    assert.equal(isGradeCriteriaAuditEvent({ activityType: 'GRADE_CRITERIA_SAVED' }), true)
    assert.equal(isGradeCriteriaAuditEvent({ event_type: 'module_created' }), false)
  })

  it('extracts components from legacy criteria blobs', () => {
    const legacy = {
      criteria: {
        criteria: [{ id: '1', name: 'Written Work', percentage: 25, component_order: 0 }],
        components: [{ id: '1', name: 'Written Work', percentage: 25, component_order: 0 }],
        total_pct: 25,
      },
    }
    const extracted = extractComponentsFromAuditValues(legacy)
    assert.equal(extracted.length, 1)
    assert.equal(extracted[0].name, 'Written Work')
  })

  it('dedupes duplicate components by name and order', () => {
    const dupes = [
      { id: '1', name: 'Written Work', percentage: 25, component_order: 0 },
      { id: '2', name: 'Written Work', percentage: 25, component_order: 0 },
      { id: '3', name: 'Quizzes', percentage: 15, component_order: 2 },
      { id: '7', name: 'Quizzes', percentage: 15, component_order: 2 },
    ]
    const deduped = dedupeComponentsForAudit(dupes)
    assert.equal(deduped.length, 2)
    assert.equal(deduped[0].id, '1')
    assert.equal(deduped[1].id, '3')
  })

  it('normalizes legacy duplicate cleanup into scalar total weight diff', () => {
    const component = (id, name, pct, order, mapsTo, flags = {}) => ({
      id: String(id),
      name,
      color: '#3B82F6',
      is_quiz: false,
      maps_to: mapsTo,
      percentage: pct,
      component_order: order,
      maps_to_activity: flags.maps_to_activity ?? false,
      maps_to_assignment: flags.maps_to_assignment ?? false,
    })

    const makeSnapshot = (ids, totalPct) => ({
      criteria: ids.map((id) => {
        if (id === '1' || id === '2') {
          return component(id, 'Written Work', 25, 0, ['Assignment'], { maps_to_assignment: true })
        }
        if (id === '3' || id === '4') {
          return component(id, 'Performance Task', 45, 1, ['Assignment', 'Activity'], {
            maps_to_assignment: true,
            maps_to_activity: true,
          })
        }
        if (id === '5' || id === '7') {
          return component(id, 'Quizzes', 15, 2, ['Quiz'], { is_quiz: true })
        }
        return component(id, 'Activities', 15, 3, ['Activity'], { maps_to_activity: true })
      }),
      total_pct: totalPct,
      configured: true,
      subject_id: 3,
    })

    const oldIds = ['1', '2', '3', '4', '5', '7', '6', '8']
    const newIds = ['1', '3', '5', '6']
    const oldSnapshot = makeSnapshot(oldIds, 200)
    const newSnapshot = makeSnapshot(newIds, 100)

    const legacyDiffs = {
      criteria: {
        old: oldSnapshot,
        new: newSnapshot,
        before: oldSnapshot,
        after: newSnapshot,
      },
    }

    assert.equal(hasScalarDetailedDiffs(legacyDiffs), false)

    const normalized = resolveGradeCriteriaAuditDisplay({
      event_type: 'grade_criteria_saved',
      old_values: { criteria: oldSnapshot, components: oldSnapshot.criteria },
      new_values: { criteria: newSnapshot, components: newSnapshot.criteria },
      detailedDiffs: legacyDiffs,
      changed_fields: ['criteria'],
    })

    assert.ok(normalized)
    assert.equal(normalized.detailedDiffs.criteria, undefined)
    assert.equal(normalized.detailedDiffs.components, undefined)
    assert.equal(normalized.detailedDiffs['Total weight %'].old, '200%')
    assert.equal(normalized.detailedDiffs['Total weight %'].new, '100%')
    assert.equal(normalized.old_values['Written Work %'], '25%')
    assert.equal(normalized.new_values['Quizzes %'], '15%')
  })

  it('passes through scalar detailedDiffs from new saves unchanged', () => {
    const scalarDiffs = {
      'Written Work %': { old: '25%', new: '30%' },
    }
    assert.equal(hasScalarDetailedDiffs(scalarDiffs), true)

    const normalized = resolveGradeCriteriaAuditDisplay({
      event_type: 'grade_criteria_saved',
      old_values: { 'Written Work %': '25%' },
      new_values: { 'Written Work %': '30%' },
      detailedDiffs: scalarDiffs,
      changed_fields: ['Written Work %'],
    })

    assert.ok(normalized)
    assert.equal(normalized.detailedDiffs['Written Work %'].old, '25%')
    assert.equal(normalized.detailedDiffs['Written Work %'].new, '30%')
  })
})
