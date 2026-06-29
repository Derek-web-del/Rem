import assert from 'node:assert/strict'
import { describe, it, beforeEach, afterEach } from 'node:test'
import { analyzeText } from '../server/lib/plagiarismEngine.js'
import {
  analyzeTextSemantic,
  clearEmbedTextsOverride,
  getAiProvider,
  mergePlagiarismResults,
  setEmbedTextsOverride,
  vectorCosineSimilarity,
} from '../server/lib/plagiarismAiEngine.js'

const PARAPHRASE_VEC = [0.96, 0.28, 0]
const DISTINCT_VEC = [0.1, 0.99, 0]
const UNRELATED_VEC = [0.02, 0.01, 0.99]

/** @param {string} text */
function mockEmbed(text) {
  const lower = text.toLowerCase()
  if (lower.includes('paraphrase') || lower.includes('semantic')) return PARAPHRASE_VEC
  if (lower.includes('distinct')) return DISTINCT_VEC
  return UNRELATED_VEC
}

describe('plagiarismAiEngine', () => {
  beforeEach(() => {
    setEmbedTextsOverride(async (texts) => texts.map(mockEmbed))
  })

  afterEach(() => {
    clearEmbedTextsOverride()
  })

  it('vectorCosineSimilarity returns 1 for identical vectors', () => {
    assert.ok(Math.abs(vectorCosineSimilarity(PARAPHRASE_VEC, PARAPHRASE_VEC) - 1) < 1e-6)
  })

  it('getAiProvider respects off setting', () => {
    const prev = process.env.PLAGIARISM_AI_PROVIDER
    process.env.PLAGIARISM_AI_PROVIDER = 'off'
    assert.equal(getAiProvider(), 'none')
    process.env.PLAGIARISM_AI_PROVIDER = prev
  })

  it('analyzeTextSemantic detects paraphrased reference content', async () => {
    const submitted =
      'This is a semantic paraphrase sentence that should match the reference meaning closely enough for analysis.'
    const reference = {
      url: 'https://example.com/wiki',
      title: 'Example Wiki',
      text: 'Another semantic paraphrase with different wording but similar embedding vector.',
    }
    const result = await analyzeTextSemantic(submitted, [reference])
    assert.ok(result.similarity_score >= 70)
    assert.ok(result.flagged_sentences.length >= 1)
  })

  it('lexical analysis scores low on paraphrase that semantic detects', () => {
    const submitted =
      'Photosynthesis converts light energy into chemical energy stored in glucose molecules.'
    const reference = {
      url: 'https://example.com/bio',
      title: 'Biology',
      text: 'Plants transform sunlight into sugar through a process of energy conversion in cells.',
    }
    const lexical = analyzeText([submitted], [reference])
    assert.ok(lexical.similarity_score < 50)
  })

  it('mergePlagiarismResults blends lexical and semantic scores', () => {
    const lexical = {
      similarity_score: 20,
      risk_level: 'Low',
      flagged_sentences: [],
      web_sources: [{ url: 'https://a.test', title: 'A', similarity_score: 20 }],
    }
    const semantic = {
      similarity_score: 80,
      risk_level: 'High',
      flagged_sentences: [
        {
          sentence: 'Flagged by semantic engine.',
          similarity: 85,
          source_url: 'https://b.test',
          source_title: 'B',
        },
      ],
      web_sources: [{ url: 'https://b.test', title: 'B', similarity_score: 80 }],
    }

    const merged = mergePlagiarismResults(lexical, semantic, 'local')
    assert.equal(merged.similarity_score, 80)
    assert.equal(merged.analysis_method, 'AI Embeddings + TF-IDF + Cosine Similarity')
    assert.equal(merged.ai_provider, 'local')
    assert.equal(merged.lexical_score, 20)
    assert.equal(merged.semantic_score, 80)
    assert.equal(merged.flag, 'Paraphrase suspected — review flagged sentences')
    assert.equal(merged.flagged_sentences.length, 1)
    assert.equal(merged.web_sources.length, 2)
    assert.equal(merged.risk_level, 'High')
  })

  it('mergePlagiarismResults uses weighted blend when lexical and semantic agree within 35', () => {
    const lexical = {
      similarity_score: 40,
      risk_level: 'Medium',
      flagged_sentences: [],
      web_sources: [],
    }
    const semantic = {
      similarity_score: 50,
      risk_level: 'Medium',
      flagged_sentences: [],
      web_sources: [],
    }

    const merged = mergePlagiarismResults(lexical, semantic, 'local')
    assert.equal(merged.similarity_score, 46)
    assert.equal(merged.flag, null)
    assert.equal(merged.risk_level, 'Medium')
  })

  it('mergePlagiarismResults returns lexical-only when AI disabled', () => {
    const lexical = {
      similarity_score: 42,
      risk_level: 'Medium',
      flagged_sentences: [{ sentence: 'x', similarity: 40, source_url: '', source_title: '' }],
      web_sources: [],
    }
    const merged = mergePlagiarismResults(lexical, null, 'none')
    assert.equal(merged.similarity_score, 42)
    assert.equal(merged.analysis_method, 'TF-IDF + Cosine Similarity')
    assert.equal(merged.ai_provider, 'none')
    assert.equal(merged.semantic_score, null)
  })
})
