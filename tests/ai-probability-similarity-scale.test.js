import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  deriveAiScoresFromSimilarity,
  scaleAiProbabilityFromSimilarity,
} from '../shared/aiProbabilityBands.js'

describe('AI probability similarity scale', () => {
  it('maps similarity to half-scale AI probability', () => {
    assert.equal(scaleAiProbabilityFromSimilarity(46), 23)
    assert.equal(scaleAiProbabilityFromSimilarity(90), 45)
    assert.equal(scaleAiProbabilityFromSimilarity(0), 0)
    assert.equal(scaleAiProbabilityFromSimilarity(100), 50)
  })

  it('deriveAiScoresFromSimilarity returns aligned lexical, semantic, and verdict', () => {
    const at46 = deriveAiScoresFromSimilarity(46)
    assert.ok(at46)
    assert.equal(at46.probability, 23)
    assert.equal(at46.lexical_score, 20.7)
    assert.equal(at46.semantic_score, 25.3)
    assert.equal(at46.verdict, 'Likely Human')

    const at90 = deriveAiScoresFromSimilarity(90)
    assert.ok(at90)
    assert.equal(at90.probability, 45)
    assert.equal(at90.lexical_score, 40.5)
    assert.equal(at90.semantic_score, 49.5)
    assert.equal(at90.verdict, 'Mixed')
  })
})
