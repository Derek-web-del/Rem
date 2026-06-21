import { splitIntoSentences } from './plagiarismEngine.js'

const FUNCTION_WORDS = new Set([
  'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'so', 'because', 'as', 'while', 'when',
  'where', 'which', 'that', 'this', 'these', 'those', 'it', 'its', 'is', 'are', 'was', 'were',
  'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'can', 'to', 'of', 'in', 'on', 'at', 'by', 'for', 'with',
  'from', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under',
  'over', 'not', 'no', 'nor', 'very', 'also', 'just', 'more', 'most', 'such', 'than', 'too',
  'there', 'their', 'they', 'them', 'we', 'our', 'you', 'your', 'he', 'she', 'his', 'her',
])

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

/**
 * Per-sentence AI-likeness score (0 = human-like, 1 = AI-like).
 * Uses predictability proxies: uniform length, low burstiness, low vocab richness, high function-word ratio.
 */
function scoreSentence(features, docBurstiness, meanTokenCount) {
  const { tokenCount, avgWordLength, vocabRichness, functionWordRatio } = features
  if (tokenCount === 0) return 0.5

  const lengthUniformity = 1 - normalize(Math.abs(tokenCount - meanTokenCount), 0, Math.max(meanTokenCount, 8))
  const lowBurstiness = 1 - normalize(docBurstiness, 0, 80)
  const lowRichness = 1 - normalize(vocabRichness, 0.35, 0.95)
  const highFunctionWords = normalize(functionWordRatio, 0.35, 0.75)
  const moderateWordLength = 1 - Math.abs(avgWordLength - 5.2) / 5.2

  const aiScore =
    lengthUniformity * 0.28 +
    lowBurstiness * 0.22 +
    lowRichness * 0.22 +
    highFunctionWords * 0.18 +
    moderateWordLength * 0.1

  return clamp(aiScore, 0, 1)
}

export function getAiVerdict(probability) {
  if (probability == null || Number.isNaN(probability)) return 'Unknown'
  if (probability >= 70) return 'Likely AI-generated'
  if (probability >= 31) return 'Mixed'
  return 'Likely Human'
}

/**
 * Local AI-generated content detection via perplexity + burstiness proxies.
 * @param {string} text
 * @returns {{ probability: number|null, verdict: string, sentences: Array<{ sentence: string, classification: 'ai'|'human', confidence: number }> }}
 */
export function detectAiContent(text) {
  const trimmed = String(text || '').trim()
  if (trimmed.length < 50) {
    return { probability: null, verdict: 'Unknown', sentences: [] }
  }

  const rawSentences = splitIntoSentences(trimmed)
  if (!rawSentences.length) {
    return { probability: null, verdict: 'Unknown', sentences: [] }
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
    const aiScore = scoreSentence(features, docBurstiness, meanTokenCount)
    const confidence = Math.abs(aiScore - 0.5) * 2
    const classification = aiScore >= 0.55 ? 'ai' : 'human'
    return { sentence, classification, confidence: Math.round(confidence * 100) / 100, aiScore }
  })

  let weightedSum = 0
  let weightTotal = 0
  for (const item of scored) {
    const weight = Math.max(item.confidence, 0.1)
    weightedSum += item.aiScore * 100 * weight
    weightTotal += weight
  }

  const probability = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 10) / 10 : null
  const verdict = getAiVerdict(probability)

  const sentences = scored.map(({ sentence, classification, confidence }) => ({
    sentence,
    classification,
    confidence,
  }))

  return { probability, verdict, sentences }
}
