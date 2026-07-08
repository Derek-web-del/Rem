import apiFetch from './apiClient.js'
import { getRiskLevelFromScore } from '../../../shared/plagiarismRiskBands.js'
import { AI_LIKELY_MIN, AI_MIXED_MIN } from '../../../shared/aiProbabilityBands.js'

export const ACCEPT_FILE_TYPES = '.txt,.pdf'

function parseFlaggedSentences(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { sentence: item.trim(), similarity: 0, source_url: '', source_title: '' }
      }
      if (item && typeof item === 'object') {
        return {
          sentence: String(item.sentence ?? '').trim(),
          similarity: Number(item.similarity ?? 0) || 0,
          source_url: String(item.source_url ?? item.sourceUrl ?? '').trim(),
          source_title: String(item.source_title ?? item.sourceTitle ?? '').trim(),
        }
      }
      return null
    })
    .filter((item) => item?.sentence)
}

function parseWebSources(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => ({
      url: String(item?.url ?? '').trim(),
      title: String(item?.title ?? item?.url ?? '').trim(),
      similarity_score: Number(item?.similarity_score ?? item?.similarityScore ?? 0) || 0,
    }))
    .filter((item) => item.url)
}

function parseAiSentenceResults(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => {
      if (!item || typeof item !== 'object') return null
      const classification = String(item.classification ?? '').trim().toLowerCase()
      return {
        sentence: String(item.sentence ?? '').trim(),
        classification: classification === 'ai' ? 'ai' : 'human',
        confidence: Number(item.confidence ?? 0) || 0,
      }
    })
    .filter((item) => item?.sentence)
}

export function mapReportRow(row) {
  if (!row || typeof row !== 'object') return null
  return {
    id: row.id != null ? String(row.id) : '',
    content: String(row.content ?? '').trim(),
    inputType: String(row.inputType ?? row.input_type ?? 'text').trim() === 'file' ? 'file' : 'text',
    fileName: row.fileName ?? row.file_name ?? null,
    similarityScore: row.similarityScore != null ? Number(row.similarityScore) : Number(row.similarity_score ?? 0),
    riskLevel: String(row.riskLevel ?? row.risk_level ?? '').trim() || null,
    flaggedSentences: parseFlaggedSentences(row.flaggedSentences ?? row.flagged_sentences),
    webSources: parseWebSources(row.webSources ?? row.web_sources),
    sourcesChecked: row.sourcesChecked != null ? Number(row.sourcesChecked) : Number(row.sources_checked ?? 0),
    processingTimeMs:
      row.processingTimeMs != null ? Number(row.processingTimeMs) : Number(row.processing_time_ms ?? 0),
    analysisMethod: String(row.analysisMethod ?? row.analysis_method ?? 'TF-IDF + Cosine Similarity').trim(),
    aiProvider: String(row.aiProvider ?? row.ai_provider ?? 'none').trim() || 'none',
    lexicalScore: row.lexicalScore != null ? Number(row.lexicalScore) : row.lexical_score != null ? Number(row.lexical_score) : null,
    semanticScore: row.semanticScore != null ? Number(row.semanticScore) : row.semantic_score != null ? Number(row.semantic_score) : null,
    aiProbability:
      row.aiProbability != null
        ? Number(row.aiProbability)
        : row.ai_probability != null
          ? Number(row.ai_probability)
          : null,
    aiLexicalScore:
      row.aiLexicalScore != null
        ? Number(row.aiLexicalScore)
        : row.ai_lexical_score != null
          ? Number(row.ai_lexical_score)
          : null,
    aiSemanticScore:
      row.aiSemanticScore != null
        ? Number(row.aiSemanticScore)
        : row.ai_semantic_score != null
          ? Number(row.ai_semantic_score)
          : null,
    aiVerdict: row.aiVerdict ?? row.ai_verdict ?? null,
    aiSentenceResults: parseAiSentenceResults(row.aiSentenceResults ?? row.ai_sentence_results),
    aiDetectionEnabled:
      row.aiDetectionEnabled === true ||
      row.ai_detection_enabled === true,
    aiDetectionRan:
      row.aiDetectionRan === true ||
      row.ai_detection_ran === true ||
      row.aiDetectionEnabled === true ||
      row.ai_detection_enabled === true ||
      row.aiProbability != null ||
      row.ai_probability != null,
    createdAt: row.createdAt ?? row.created_at ?? null,
  }
}

export async function fetchPlagiarismReports() {
  const res = await apiFetch('/api/v1/plagiarism-reports')
  const data = await res.json().catch(() => ({}))
  return (Array.isArray(data.reports) ? data.reports : []).map(mapReportRow).filter(Boolean)
}

export async function fetchPlagiarismReport(id) {
  const res = await apiFetch(`/api/v1/plagiarism-reports/${encodeURIComponent(String(id))}`)
  const data = await res.json().catch(() => ({}))
  return mapReportRow(data.report)
}

/** @param {{ content?: string, file?: File|null, runAiDetection?: boolean }} payload */
export async function submitForAnalysis({ content, file, runAiDetection = true } = {}) {
  if (file) {
    const form = new FormData()
    form.append('file', file)
    form.append('run_ai_detection', runAiDetection ? 'true' : 'false')
    const res = await apiFetch('/api/v1/plagiarism-reports', {
      method: 'POST',
      body: form,
    })
    const data = await res.json().catch(() => ({}))
    return mapReportRow(data.report)
  }

  const trimmed = String(content ?? '').trim()
  if (trimmed.length < 50) {
    throw new Error('Text too short. Minimum 50 characters required.')
  }

  const res = await apiFetch('/api/v1/plagiarism-reports', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: trimmed,
      input_type: 'text',
      run_ai_detection: !!runAiDetection,
    }),
  })
  const data = await res.json().catch(() => ({}))
  return mapReportRow(data.report)
}

/** @deprecated Use submitForAnalysis — server computes all scores. */
export async function createPlagiarismReport(payload) {
  return submitForAnalysis({ content: payload?.content, file: payload?.file })
}

export async function deletePlagiarismReport(id) {
  await apiFetch(`/api/v1/plagiarism-reports/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
}

export function getRiskLevel(score) {
  const level = getRiskLevelFromScore(score)
  const tone = level === 'Low' ? 'green' : level === 'Medium' ? 'yellow' : 'red'
  return { label: `${level} Risk`, short: level, tone }
}

export function riskBadgeStyle(tone) {
  if (tone === 'green') return { bg: '#DCFCE7', color: '#15803D', dot: '#22C55E' }
  if (tone === 'yellow') return { bg: '#FEF9C3', color: '#A16207', dot: '#EAB308' }
  return { bg: '#FEE2E2', color: '#B91C1C', dot: '#EF4444' }
}

export function formatReportDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function formatReportDateOnly(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatReportTimeDetail(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
  const time = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${date} at ${time}`
}

export function contentPreview(text, max = 52) {
  const t = String(text || '').trim()
  if (!t) return '—'
  if (t.length <= max) return t
  return `${t.slice(0, max).trim()}…`
}

export function inputTypeLabel(inputType) {
  return inputType === 'file' ? 'File Upload' : 'Text Input'
}

export function sentenceText(item) {
  if (typeof item === 'string') return item
  return String(item?.sentence ?? '')
}

export function formatProcessingTime(ms) {
  const n = Number(ms) || 0
  if (n < 1000) return '< 1 second'
  return `${(n / 1000).toFixed(1)}s`
}

export function formatAiProviderLabel(provider) {
  const p = String(provider || '').trim().toLowerCase()
  if (p === 'openai') return 'OpenAI Embeddings'
  if (p === 'local') return 'Local AI (on-server)'
  return 'None (lexical only)'
}

export function webSourceScoreClass(score) {
  const n = Number(score) || 0
  if (n >= 71) return 'text-red-600'
  if (n >= 31) return 'text-orange-500'
  return 'text-green-600'
}

export function getAiVerdictStyle(probability, verdict) {
  const p = probability != null ? Number(probability) : null
  const v = String(verdict || '').toLowerCase()
  if (p != null && p >= AI_LIKELY_MIN) {
    return { bg: '#EEEDFE', color: '#534AB7', border: '#AFA9EC', icon: 'ti-robot', short: 'AI' }
  }
  if (p != null && p >= AI_MIXED_MIN) {
    return { bg: '#FAEEDA', color: '#633806', border: '#EF9F27', icon: 'ti-alert-triangle', short: 'Mixed' }
  }
  if (p != null || v.includes('human')) {
    return { bg: '#EAF3DE', color: '#27500A', border: '#97C459', icon: 'ti-check', short: 'Human' }
  }
  return { bg: '#F3F4F6', color: '#6B7280', border: '#D1D5DB', icon: 'ti-help', short: 'Unknown' }
}

export function formatAiVerdictShort(verdict, probability) {
  const style = getAiVerdictStyle(probability, verdict)
  return style.short
}

export function formatAiVerdictLabel(verdict) {
  const v = String(verdict || '').trim()
  if (!v || v === 'Unknown') return 'Unknown'
  if (v === 'Likely AI-generated') return 'Likely AI'
  if (v === 'Likely Human') return 'Likely Human'
  if (v === 'Mixed') return 'Mixed'
  return v
}
