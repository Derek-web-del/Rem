import { splitIntoSentences } from './plagiarismEngine.js'
import { getAiVerdictFromScore } from '../../shared/aiProbabilityBands.js'

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as', 'while', 'when',
  'where', 'which', 'that', 'this', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'over', 'not', 'no', 'nor', 'very', 'also', 'just', 'more', 'most', 'such', 'than', 'too',
  'there', 'their', 'they', 'them', 'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her',
])

const LEXICAL_WEIGHT = 0.4
const SEMANTIC_WEIGHT = 0.6
const AI_SENTENCE_THRESHOLD = 0.52

/** Common transition and register markers in LLM-generated academic/essay text */
const AI_DISCOURSE_PATTERN =
  /\b(furthermore|moreover|additionally|in addition|it is important|overall|in conclusion|therefore|thus|consequently|significant|comprehensive|utilize|utilise|facilitate|enhance|crucial|essential|robust|landscape|delve|multifaceted|myriad|pivotal|underscores|highlights|notably|likewise|nevertheless|however|thereby|paramount|increasingly|transforming|integration|implementation|framework|paradigm|leverage|streamline|underscore|holistic|nuanced|meticulous|intricacies|stakeholders|enabling|potential|address|concerns|thoughtfully|equitable|outcomes|learners|institutions)\b/gi

function splitWords(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^\w\s']/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
}

function sentenceFeatures(sentence) {
  const words = splitWords(sentence)
  const tokenCount = words.length
  if (tokenCount === 0) {
    return { tokenCount: 0, avgWordLength: 0, vocabRichness: 0, functionWordRatio: 0 }
  }
  const unique = new Set(words)
  const avgWordLength = words.reduce((sum, w) => sum + w.length, 0) / tokenCount
  const vocabRichness = unique.size / tokenCount
  const functionWordRatio = words.filter((w) => FUNCTION_WORDS.has(w)).length / tokenCount
  return { tokenCount, avgWordLength, vocabRichness, functionWordRatio }
}

function variance(values) {
  if (!values.length) return 0
  const mean = values.reduce((a, b) => a + b, 0) / values.length
  return values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function normalize(value, min, max) {
  if (max <= min) return 0.5
  return clamp((value - min) / (max - min), 0, 1)
}

function roundScore(value) {
  return Math.round(Number(value) * 10) / 10
}

function discourseMarkerDensity(sentence) {
  const words = splitWords(sentence)
  if (!words.length) return 0
  const matches = String(sentence).match(AI_DISCOURSE_PATTERN) || []
  return normalize(matches.length / Math.max(words.length / 10, 1), 0, 0.55)
}

/**
 * Compress inflated base scores into a practical review band (~55–65% for typical LLM
 * essays). Strongly uniform / repetitive AI text may still reach the mid-60s.
 */
function calibrateAiProbability(lexicalScore, semanticScore, baseProbability, docBurstiness, aiSentenceRatio) {
  let probability = baseProbability

  if (semanticScore >= 65 && docBurstiness <= 40) {
    const aiSignal = semanticScore * 0.55 + lexicalScore * 0.45
    const compressed = roundScore(48.05 + aiSignal * 0.167)
    probability = Math.min(baseProbability, compressed)
  }

  if (semanticScore >= 90 && docBurstiness <= 0.5 && aiSentenceRatio >= 0.85) {
    const repetitiveLift = roundScore(60 + aiSentenceRatio * 6)
    probability = Math.min(Math.max(probability, repetitiveLift), 66)
  }

  return roundScore(probability)
}

/**
 * Lexical AI-likeness: discourse markers, function words, and moderate vocabulary richness.
 * Semantic AI-likeness: sentence-length uniformity and low burstiness (flow predictability).
 */
function scoreSentenceComponents(features, docBurstiness, meanTokenCount, sentence) {
  const { tokenCount, avgWordLength, vocabRichness, functionWordRatio } = features
  if (tokenCount === 0) {
    return { lexical: 0.5, semantic: 0.5, combined: 0.5 }
  }

  const lengthUniformity = 1 - normalize(Math.abs(tokenCount - meanTokenCount), 0, Math.max(meanTokenCount, 8))
  const lowBurstiness = 1 - normalize(docBurstiness, 0, 80)
  // LLM essays often sit in a moderate richness band rather than very low richness.
  const richnessAiSignature = 1 - Math.abs(vocabRichness - 0.58) / 0.42
  const highFunctionWords = normalize(functionWordRatio, 0.38, 0.72)
  const moderateWordLength = clamp(1 - Math.abs(avgWordLength - 5.2) / 5.2, 0, 1)
  const discourseDensity = discourseMarkerDensity(sentence)

  const lexical = clamp(
    richnessAiSignature * 0.26 +
      highFunctionWords * 0.3 +
      moderateWordLength * 0.14 +
      discourseDensity * 0.3,
    0,
    1,
  )
  const semantic = clamp(lengthUniformity * 0.56 + lowBurstiness * 0.44, 0, 1)
  const combined = clamp(lexical * LEXICAL_WEIGHT + semantic * SEMANTIC_WEIGHT, 0, 1)

  return { lexical, semantic, combined }
}

export function getAiVerdict(probability) {
  return getAiVerdictFromScore(probability)
}

/**
 * Local AI-generated content detection with lexical + semantic probability sub-scores.
 * Overall AI probability = 40% lexical + 60% semantic (0–100 scale).
 * @param {string} text
 * @returns {{
 *   probability: number|null,
 *   lexical_score: number|null,
 *   semantic_score: number|null,
 *   verdict: string,
 *   sentences: Array<{ sentence: string, classification: 'ai'|'human', confidence: number }>
 * }}
 */
export function detectAiContent(text) {
  const trimmed = String(text || '').trim()
  if (trimmed.length < 50) {
    return { probability: null, lexical_score: null, semantic_score: null, verdict: 'Unknown', sentences: [] }
  }

  const rawSentences = splitIntoSentences(trimmed)
  if (!rawSentences.length) {
    return { probability: null, lexical_score: null, semantic_score: null, verdict: 'Unknown', sentences: [] }
  }

  const featureList = rawSentences.map((sentence) => ({
    sentence,
    features: sentenceFeatures(sentence),
  }))

  const tokenCounts = featureList.map((item) => item.features.tokenCount).filter((n) => n > 0)
  const meanTokenCount = tokenCounts.length
    ? tokenCounts.reduce((a, b) => a + b, 0) / tokenCounts.length
    : 0
  const docBurstiness = variance(tokenCounts)

  const scored = featureList.map(({ sentence, features }) => {
    const { lexical, semantic, combined } = scoreSentenceComponents(
      features,
      docBurstiness,
      meanTokenCount,
      sentence,
    )
    const confidence = Math.abs(combined - 0.5) * 2
    const classification = combined >= AI_SENTENCE_THRESHOLD ? 'ai' : 'human'
    return { sentence, classification, confidence: Math.round(confidence * 100) / 100, lexical, semantic, combined }
  })

  let lexicalSum = 0
  let semanticSum = 0
  let weightTotal = 0
  for (const item of scored) {
    const weight = Math.max(item.confidence, 0.1)
    lexicalSum += item.lexical * 100 * weight
    semanticSum += item.semantic * 100 * weight
    weightTotal += weight
  }

  const lexical_score = weightTotal > 0 ? roundScore(lexicalSum / weightTotal) : null
  const semantic_score = weightTotal > 0 ? roundScore(semanticSum / weightTotal) : null
  const baseProbability =
    lexical_score != null && semantic_score != null
      ? roundScore(lexical_score * LEXICAL_WEIGHT + semantic_score * SEMANTIC_WEIGHT)
      : null
  const aiSentenceRatio = scored.length ? scored.filter((s) => s.classification === 'ai').length / scored.length : 0
  const probability =
    baseProbability != null
      ? calibrateAiProbability(lexical_score, semantic_score, baseProbability, docBurstiness, aiSentenceRatio)
      : null
  const verdict = getAiVerdict(probability)

  const sentences = scored.map(({ sentence, classification, confidence }) => ({
    sentence,
    classification,
    confidence,
  }))

  return { probability, lexical_score, semantic_score, verdict, sentences }
}
