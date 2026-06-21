import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectAiContent, getAiVerdict } from '../server/lib/aiContentDetector.js'

describe('aiContentDetector', () => {
  it('returns Unknown for empty or short text', () => {
    const empty = detectAiContent('')
    assert.equal(empty.verdict, 'Unknown')
    assert.equal(empty.probability, null)
    assert.deepEqual(empty.sentences, [])

    const short = detectAiContent('Too short for analysis.')
    assert.equal(short.verdict, 'Unknown')
    assert.equal(short.probability, null)
  })

  it('getAiVerdict maps score bands', () => {
    assert.equal(getAiVerdict(0), 'Likely Human')
    assert.equal(getAiVerdict(30), 'Likely Human')
    assert.equal(getAiVerdict(31), 'Mixed')
    assert.equal(getAiVerdict(69), 'Mixed')
    assert.equal(getAiVerdict(70), 'Likely AI-generated')
    assert.equal(getAiVerdict(100), 'Likely AI-generated')
    assert.equal(getAiVerdict(null), 'Unknown')
  })

  it('returns sentence array with classification and confidence', () => {
    const text =
      'Artificial intelligence is transforming education by enabling personalized learning paths for students. ' +
      'Teachers can use automated tools to reduce administrative workload and focus on instruction. ' +
      'The integration of technology in classrooms continues to evolve rapidly across many institutions today.'
    const result = detectAiContent(text)
    assert.ok(Array.isArray(result.sentences))
    assert.ok(result.sentences.length >= 1)
    for (const item of result.sentences) {
      assert.ok(item.sentence.length >= 20)
      assert.ok(item.classification === 'ai' || item.classification === 'human')
      assert.ok(item.confidence >= 0 && item.confidence <= 1)
    }
  })

  it('uniform repetitive text scores higher than varied human-like text', () => {
    const uniform =
      'Furthermore, it is important to note that this approach provides significant benefits for all stakeholders involved. ' +
      'Furthermore, it is important to note that this approach provides significant benefits for all stakeholders involved. ' +
      'Furthermore, it is important to note that this approach provides significant benefits for all stakeholders involved. ' +
      'Furthermore, it is important to note that this approach provides significant benefits for all stakeholders involved.'
    const varied =
      'I messed up the lab report. Badly. The professor laughed though — said my hypothesis was "bold." ' +
      'My group? Not amused. We rebuilt the whole experiment in one night using duct tape and hope. ' +
      'Somehow it worked. Science is weird like that sometimes, honestly.'

    const uniformResult = detectAiContent(uniform)
    const variedResult = detectAiContent(varied)
    assert.ok(uniformResult.probability != null)
    assert.ok(variedResult.probability != null)
    assert.ok(
      uniformResult.probability >= variedResult.probability,
      `expected uniform (${uniformResult.probability}) >= varied (${variedResult.probability})`,
    )
  })
})
