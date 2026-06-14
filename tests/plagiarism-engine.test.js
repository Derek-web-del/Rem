import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  analyzeText,
  cosineSimilarity,
  getRiskLevel,
  splitIntoSentences,
  tokenize,
} from '../server/lib/plagiarismEngine.js'

describe('plagiarismEngine', () => {
  it('tokenize removes stop words and stems', () => {
    const tokens = tokenize('The students are running quickly through the classroom')
    assert.ok(tokens.length > 0)
    assert.ok(!tokens.includes('the'))
    assert.ok(!tokens.includes('are'))
  })

  it('cosineSimilarity returns ~1 for identical token vectors', () => {
    const vec = { test: 1, example: 0.5 }
    assert.ok(Math.abs(cosineSimilarity(vec, vec) - 1) < 1e-9)
  })

  it('splitIntoSentences filters short fragments', () => {
    const sentences = splitIntoSentences('Hi. This is a long enough sentence for analysis. Ok.')
    assert.equal(sentences.length, 1)
  })

  it('getRiskLevel maps score bands', () => {
    assert.equal(getRiskLevel(10), 'Low')
    assert.equal(getRiskLevel(30), 'Low')
    assert.equal(getRiskLevel(31), 'Medium')
    assert.equal(getRiskLevel(45), 'Medium')
    assert.equal(getRiskLevel(60), 'Medium')
    assert.equal(getRiskLevel(70), 'Medium')
    assert.equal(getRiskLevel(71), 'High')
    assert.equal(getRiskLevel(80), 'High')
  })

  it('analyzeText flags similar reference content', () => {
    const submitted =
      'Artificial intelligence is transforming education by enabling personalized learning paths and automating administrative tasks for teachers everywhere.'
    const reference = {
      url: 'https://example.com/ai-education',
      title: 'AI in Education',
      text: submitted,
    }
    const result = analyzeText(submitted, [reference])
    assert.ok(result.similarity_score >= 70)
    assert.equal(result.risk_level, 'High')
    assert.ok(result.flagged_sentences.length >= 1)
    assert.equal(result.web_sources[0].url, reference.url)
  })
})
