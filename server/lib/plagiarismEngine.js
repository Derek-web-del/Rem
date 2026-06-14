import natural from 'natural'
import { getRiskLevelFromScore } from '../../shared/plagiarismRiskBands.js'

const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'could', 'did', 'do', 'does', 'doing', 'down', 'during', 'each', 'few', 'for',
  'from', 'further', 'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself',
  'him', 'himself', 'his', 'how', 'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself', 'just',
  'me', 'more', 'most', 'my', 'myself', 'no', 'nor', 'not', 'now', 'of', 'off', 'on', 'once',
  'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'she',
  'should', 'so', 'some', 'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves',
  'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until',
  'up', 'very', 'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom',
  'why', 'will', 'with', 'would', 'you', 'your', 'yours', 'yourself', 'yourselves',
])

const stemmer = natural.PorterStemmer

/** @param {string} text */
export function tokenize(text) {
  const lower = String(text || '').toLowerCase()
  const words = lower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(Boolean)
  return words
    .filter((w) => !STOP_WORDS.has(w) && w.length > 1)
    .map((w) => stemmer.stem(w))
}

/** @param {string[]} tokens @param {Record<string, number>} [idfMap] */
export function buildTfIdf(tokens, idfMap = {}) {
  const tf = {}
  for (const t of tokens) {
    tf[t] = (tf[t] || 0) + 1
  }
  const total = tokens.length || 1
  const vec = {}
  for (const [term, count] of Object.entries(tf)) {
    const tfScore = count / total
    const idf = idfMap[term] != null ? idfMap[term] : 1
    vec[term] = tfScore * idf
  }
  return vec
}

/** @param {Record<string, number>} vecA @param {Record<string, number>} vecB */
export function cosineSimilarity(vecA, vecB) {
  const keys = new Set([...Object.keys(vecA), ...Object.keys(vecB)])
  let dot = 0
  let magA = 0
  let magB = 0
  for (const k of keys) {
    const a = vecA[k] || 0
    const b = vecB[k] || 0
    dot += a * b
    magA += a * a
    magB += b * b
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/** @param {string} text */
export function splitIntoSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20)
}

/** @param {number} score 0–100 */
export function getRiskLevel(score) {
  return getRiskLevelFromScore(score)
}

/** @param {string[]} documents */
function computeIdf(documents) {
  const n = documents.length || 1
  const df = {}
  for (const doc of documents) {
    const terms = new Set(tokenize(doc))
    for (const t of terms) {
      df[t] = (df[t] || 0) + 1
    }
  }
  const idf = {}
  for (const [term, count] of Object.entries(df)) {
    idf[term] = Math.log((n + 1) / (count + 1)) + 1
  }
  return idf
}

/** @param {string} textA @param {string} textB @param {Record<string, number>} [idf] */
function compareTexts(textA, textB, idf) {
  const idfMap = idf || computeIdf([textA, textB])
  const vecA = buildTfIdf(tokenize(textA), idfMap)
  const vecB = buildTfIdf(tokenize(textB), idfMap)
  return cosineSimilarity(vecA, vecB)
}

const FLAG_THRESHOLD = 0.35

/**
 * @param {string} submittedText
 * @param {{ url: string, title: string, text: string }[]} referenceSources
 */
export function analyzeText(submittedText, referenceSources = []) {
  const submitted = String(submittedText || '').trim()
  const sources = (referenceSources || []).filter((s) => s?.text && String(s.text).trim())

  const corpus = [submitted, ...sources.map((s) => s.text)]
  const idf = computeIdf(corpus.filter(Boolean))

  const sourceScores = sources.map((source) => {
    const sim = compareTexts(submitted, source.text, idf)
    return {
      url: String(source.url || '').trim(),
      title: String(source.title || source.url || 'Unknown source').trim(),
      similarity_score: Math.round(sim * 1000) / 10,
    }
  })

  const simValues = sourceScores.map((s) => s.similarity_score / 100)
  const maxSim = simValues.length ? Math.max(...simValues) : 0
  const avgSim = simValues.length
    ? simValues.reduce((a, b) => a + b, 0) / simValues.length
    : 0
  const combined = 0.7 * maxSim + 0.3 * avgSim
  const similarity_score = Math.round(Math.min(100, combined * 100) * 10) / 10

  const flagged_sentences = []
  const sentences = splitIntoSentences(submitted)

  for (const sentence of sentences) {
    let bestSim = 0
    let bestSource = null
    for (const source of sources) {
      const sim = compareTexts(sentence, source.text, idf)
      if (sim > bestSim) {
        bestSim = sim
        bestSource = source
      }
    }
    if (bestSim >= FLAG_THRESHOLD && bestSource) {
      flagged_sentences.push({
        sentence,
        similarity: Math.round(bestSim * 1000) / 10,
        source_url: String(bestSource.url || '').trim(),
        source_title: String(bestSource.title || bestSource.url || '').trim(),
      })
    }
  }

  flagged_sentences.sort((a, b) => b.similarity - a.similarity)

  return {
    similarity_score,
    risk_level: getRiskLevel(similarity_score),
    flagged_sentences,
    web_sources: sourceScores.sort((a, b) => b.similarity_score - a.similarity_score),
  }
}
