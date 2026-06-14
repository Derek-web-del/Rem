import { getRiskLevel, splitIntoSentences } from './plagiarismEngine.js'

const FLAG_THRESHOLD = 0.35
const LEXICAL_WEIGHT = 0.4
const SEMANTIC_WEIGHT = 0.6

const DEFAULT_OPENAI_MODEL = 'text-embedding-3-small'
const DEFAULT_LOCAL_MODEL = 'Xenova/all-MiniLM-L6-v2'

/** @type {import('@xenova/transformers').FeatureExtractionPipeline | null} */
let localPipeline = null

/** @type {((texts: string[]) => Promise<number[][]>) | null} */
let embedTextsOverride = null

/** @param {(texts: string[]) => Promise<number[][]>} fn */
export function setEmbedTextsOverride(fn) {
  embedTextsOverride = typeof fn === 'function' ? fn : null
}

export function clearEmbedTextsOverride() {
  embedTextsOverride = null
}

/**
 * Resolves the active AI provider.
 * @returns {'openai' | 'local' | 'none'}
 */
export function getAiProvider() {
  const configured = String(process.env.PLAGIARISM_AI_PROVIDER || '').trim().toLowerCase()
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()

  if (configured === 'off') return 'none'
  if (configured === 'openai') {
    return openaiKey ? 'openai' : 'local'
  }
  if (configured === 'local') return 'local'
  return 'local'
}

/** @returns {string} */
export function resolveAiProviderForStartup() {
  const configured = String(process.env.PLAGIARISM_AI_PROVIDER || '').trim().toLowerCase()
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim()
  const resolved = getAiProvider()

  if (configured === 'openai' && !openaiKey) {
    return 'local (fallback — OPENAI_API_KEY missing)'
  }
  if (!configured) {
    return resolved === 'none' ? 'none' : `${resolved} (default)`
  }
  return resolved
}

/** @param {number[]} a @param {number[]} b */
export function vectorCosineSimilarity(a, b) {
  if (!a?.length || !b?.length || a.length !== b.length) return 0
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i] || 0
    const y = b[i] || 0
    dot += x * y
    magA += x * x
    magB += y * y
  }
  if (magA === 0 || magB === 0) return 0
  return dot / (Math.sqrt(magA) * Math.sqrt(magB))
}

/** @param {number[]} values 0–1 */
function combinedScore(values) {
  if (!values.length) return 0
  const maxSim = Math.max(...values)
  const avgSim = values.reduce((sum, v) => sum + v, 0) / values.length
  const combined = 0.7 * maxSim + 0.3 * avgSim
  return Math.round(Math.min(100, combined * 100) * 10) / 10
}

async function getLocalPipeline() {
  if (!localPipeline) {
    const { pipeline } = await import('@xenova/transformers')
    const model = String(process.env.LOCAL_EMBEDDING_MODEL || DEFAULT_LOCAL_MODEL).trim() || DEFAULT_LOCAL_MODEL
    localPipeline = await pipeline('feature-extraction', model, { quantized: true })
  }
  return localPipeline
}

/** @param {string[]} texts */
async function embedLocal(texts) {
  const pipe = await getLocalPipeline()
  const vectors = []
  for (const text of texts) {
    const output = await pipe(String(text || ''), { pooling: 'mean', normalize: true })
    vectors.push(Array.from(output.data))
  }
  return vectors
}

/** @param {string[]} texts */
async function embedOpenAI(texts) {
  const apiKey = String(process.env.OPENAI_API_KEY || '').trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY is required for OpenAI embeddings')

  const model = String(process.env.OPENAI_EMBEDDING_MODEL || DEFAULT_OPENAI_MODEL).trim() || DEFAULT_OPENAI_MODEL
  const res = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: texts }),
  })

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const message = data?.error?.message || res.statusText || 'OpenAI embeddings request failed'
    throw new Error(message)
  }

  const rows = Array.isArray(data?.data) ? data.data : []
  rows.sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
  return rows.map((row) => (Array.isArray(row.embedding) ? row.embedding : []))
}

/**
 * @param {string[]} texts
 * @param {'openai' | 'local'} [provider]
 */
export async function embedTexts(texts, provider = getAiProvider()) {
  const batch = (texts || []).map((t) => String(t || '').trim()).filter(Boolean)
  if (!batch.length) return []

  if (embedTextsOverride) {
    return embedTextsOverride(batch)
  }

  if (provider === 'openai') {
    return embedOpenAI(batch)
  }
  return embedLocal(batch)
}

/**
 * @param {string} submittedText
 * @param {{ url: string, title: string, text: string }[]} referenceSources
 */
export async function analyzeTextSemantic(submittedText, referenceSources = []) {
  const submitted = String(submittedText || '').trim()
  const sources = (referenceSources || []).filter((s) => s?.text && String(s.text).trim())
  const sentences = splitIntoSentences(submitted)

  if (!submitted) {
    return {
      similarity_score: 0,
      risk_level: 'Low',
      flagged_sentences: [],
      web_sources: [],
    }
  }

  const textsToEmbed = [submitted, ...sources.map((s) => s.text), ...sentences]
  const vectors = await embedTexts(textsToEmbed)
  const submittedVec = vectors[0] || []
  const sourceVectors = vectors.slice(1, 1 + sources.length)
  const sentenceVectors = vectors.slice(1 + sources.length)

  const sourceScores = sources.map((source, index) => {
    const sim = vectorCosineSimilarity(submittedVec, sourceVectors[index] || [])
    return {
      url: String(source.url || '').trim(),
      title: String(source.title || source.url || 'Unknown source').trim(),
      similarity_score: Math.round(sim * 1000) / 10,
    }
  })

  const simValues = sourceScores.map((s) => s.similarity_score / 100)
  const similarity_score = combinedScore(simValues)

  const flagged_sentences = []
  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i]
    const sentenceVec = sentenceVectors[i] || []
    let bestSim = 0
    let bestSource = null
    for (let j = 0; j < sources.length; j += 1) {
      const sim = vectorCosineSimilarity(sentenceVec, sourceVectors[j] || [])
      if (sim > bestSim) {
        bestSim = sim
        bestSource = sources[j]
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

/** @param {object[]} items */
function mergeFlaggedSentences(items) {
  const bySentence = new Map()
  for (const item of items || []) {
    const sentence = String(item?.sentence ?? '').trim()
    if (!sentence) continue
    const existing = bySentence.get(sentence)
    const similarity = Number(item?.similarity ?? 0) || 0
    if (!existing || similarity > existing.similarity) {
      bySentence.set(sentence, {
        sentence,
        similarity,
        source_url: String(item?.source_url ?? '').trim(),
        source_title: String(item?.source_title ?? '').trim(),
      })
    }
  }
  return [...bySentence.values()].sort((a, b) => b.similarity - a.similarity)
}

/** @param {object[]} lexical @param {object[]} semantic */
function mergeWebSources(lexical, semantic) {
  const byUrl = new Map()
  for (const item of [...(lexical || []), ...(semantic || [])]) {
    const url = String(item?.url ?? '').trim()
    if (!url) continue
    const score = Number(item?.similarity_score ?? 0) || 0
    const existing = byUrl.get(url)
    if (!existing || score > existing.similarity_score) {
      byUrl.set(url, {
        url,
        title: String(item?.title ?? url).trim(),
        similarity_score: score,
      })
    }
  }
  return [...byUrl.values()].sort((a, b) => b.similarity_score - a.similarity_score)
}

/**
 * @param {ReturnType<import('./plagiarismEngine.js').analyzeText>} lexical
 * @param {Awaited<ReturnType<analyzeTextSemantic>> | null} semantic
 * @param {'openai' | 'local' | 'none'} aiProvider
 */
export function mergePlagiarismResults(lexical, semantic, aiProvider = 'none') {
  const lexicalScore = Number(lexical?.similarity_score ?? 0) || 0

  if (!semantic || aiProvider === 'none') {
    return {
      similarity_score: lexicalScore,
      risk_level: lexical?.risk_level ?? getRiskLevel(lexicalScore),
      flagged_sentences: lexical?.flagged_sentences ?? [],
      web_sources: lexical?.web_sources ?? [],
      analysis_method: 'TF-IDF + Cosine Similarity',
      ai_provider: 'none',
      lexical_score: lexicalScore,
      semantic_score: null,
    }
  }

  const semanticScore = Number(semantic.similarity_score ?? 0) || 0
  const mergedScore =
    Math.round((LEXICAL_WEIGHT * lexicalScore + SEMANTIC_WEIGHT * semanticScore) * 10) / 10

  return {
    similarity_score: mergedScore,
    risk_level: getRiskLevel(mergedScore),
    flagged_sentences: mergeFlaggedSentences([
      ...(lexical?.flagged_sentences ?? []),
      ...(semantic?.flagged_sentences ?? []),
    ]),
    web_sources: mergeWebSources(lexical?.web_sources, semantic?.web_sources),
    analysis_method: 'AI Embeddings + TF-IDF + Cosine Similarity',
    ai_provider: aiProvider,
    lexical_score: lexicalScore,
    semantic_score: semanticScore,
  }
}
