import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { detectAiContent, getAiVerdict } from '../server/lib/aiContentDetector.js'

describe('aiContentDetector', () => {
  it('returns Unknown for empty or short text', () => {
    const empty = detectAiContent('')
    assert.equal(empty.verdict, 'Unknown')
    assert.equal(empty.probability, null)
    assert.equal(empty.lexical_score, null)
    assert.equal(empty.semantic_score, null)
    assert.deepEqual(empty.sentences, [])

    const short = detectAiContent('Too short for analysis.')
    assert.equal(short.verdict, 'Unknown')
    assert.equal(short.probability, null)
    assert.equal(short.lexical_score, null)
  })

  it('getAiVerdict maps score bands', () => {
    assert.equal(getAiVerdict(0), 'Likely Human')
    assert.equal(getAiVerdict(30), 'Likely Human')
    assert.equal(getAiVerdict(31), 'Mixed')
    assert.equal(getAiVerdict(59), 'Mixed')
    assert.equal(getAiVerdict(60), 'Likely AI-generated')
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
    assert.ok(result.lexical_score != null)
    assert.ok(result.semantic_score != null)
    assert.ok(result.probability != null)
    const baseBlend = Math.round((result.lexical_score * 0.4 + result.semantic_score * 0.6) * 10) / 10
    assert.ok(result.probability >= baseBlend)
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

  it('ChatGPT-style essay scores at least 60% and Likely AI-generated', () => {
    const chatgptEssay =
      'Artificial intelligence has become an increasingly important tool in modern education because it can personalize learning experiences for students with different needs and abilities. ' +
      'Furthermore, educators can use AI-powered systems to automate routine administrative tasks, which allows them to devote more time to meaningful instruction and student support. ' +
      'In addition, the integration of intelligent technologies in the classroom may improve access to educational resources and promote more equitable outcomes for learners. ' +
      'However, schools must also address ethical concerns related to data privacy, academic integrity, and the responsible use of automated tools in assessment. ' +
      'Overall, when implemented thoughtfully, artificial intelligence has the potential to enhance teaching and learning while supporting the broader goals of educational institutions.'

    const result = detectAiContent(chatgptEssay)
    assert.ok(result.probability >= 60, `expected >= 60, got ${result.probability}`)
    assert.equal(result.verdict, 'Likely AI-generated')
  })

  it('casual human writing stays below Likely AI-generated threshold', () => {
    const humanEssay =
      'I messed up the lab report. Badly. The professor laughed though — said my hypothesis was bold. ' +
      'My group? Not amused. We rebuilt the whole experiment in one night using duct tape and hope. ' +
      'Somehow it worked. Science is weird like that sometimes, honestly. ' +
      'Next time I am starting earlier, but I still think our duct-tape sensor mount was kind of genius.'

    const result = detectAiContent(humanEssay)
    assert.ok(result.probability != null)
    assert.ok(result.probability < 60, `expected < 60, got ${result.probability}`)
    assert.notEqual(result.verdict, 'Likely AI-generated')
  })
})
