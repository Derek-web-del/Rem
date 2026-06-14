const REPORT_COLUMNS = `
  id, faculty_id, content, input_type, file_name, similarity_score, risk_level,
  flagged_sentences, web_sources, sources_checked, processing_time_ms,
  analysis_method, ai_provider, lexical_score, semantic_score, created_at
`

export async function ensurePlagiarismReportsSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS plagiarism_reports (
      id BIGSERIAL PRIMARY KEY,
      faculty_id VARCHAR(64) NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      input_type VARCHAR(32) NOT NULL DEFAULT 'text',
      file_name VARCHAR(512),
      similarity_score NUMERIC(5, 2) NOT NULL DEFAULT 0,
      flagged_sentences JSONB NOT NULL DEFAULT '[]'::jsonb,
      sources_checked INTEGER NOT NULL DEFAULT 0,
      processing_time_ms INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS web_sources JSONB NOT NULL DEFAULT '[]'::jsonb
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS risk_level VARCHAR(10) NOT NULL DEFAULT 'Low'
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS analysis_method VARCHAR(128) DEFAULT 'TF-IDF + Cosine Similarity'
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS ai_provider VARCHAR(32) DEFAULT 'none'
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS lexical_score NUMERIC(5, 2)
  `)
  await pool.query(`
    ALTER TABLE plagiarism_reports
      ADD COLUMN IF NOT EXISTS semantic_score NUMERIC(5, 2)
  `)
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_faculty_id ON plagiarism_reports (faculty_id)`,
  )
  await pool.query(
    `CREATE INDEX IF NOT EXISTS idx_plagiarism_reports_created_at ON plagiarism_reports (created_at DESC)`,
  )
}

function parseFlaggedSentences(raw) {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parseFlaggedSentences(parsed)
      } catch {
        return raw.trim() ? [{ sentence: raw.trim(), similarity: 0, source_url: '', source_title: '' }] : []
      }
    }
    return []
  }
  return raw
    .map((item) => {
      if (typeof item === 'string') {
        return { sentence: item.trim(), similarity: 0, source_url: '', source_title: '' }
      }
      if (item && typeof item === 'object') {
        return {
          sentence: String(item.sentence ?? '').trim(),
          similarity: Number(item.similarity ?? 0) || 0,
          source_url: String(item.source_url ?? '').trim(),
          source_title: String(item.source_title ?? '').trim(),
        }
      }
      return null
    })
    .filter((item) => item?.sentence)
}

function parseWebSources(raw) {
  if (!Array.isArray(raw)) {
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) return parseWebSources(parsed)
      } catch {
        return []
      }
    }
    return []
  }
  return raw
    .map((item) => ({
      url: String(item?.url ?? '').trim(),
      title: String(item?.title ?? item?.url ?? '').trim(),
      similarity_score: Number(item?.similarity_score ?? 0) || 0,
    }))
    .filter((item) => item.url)
}

export function mapPlagiarismReportRow(row) {
  if (!row) return null
  return {
    id: row.id != null ? String(row.id) : '',
    faculty_id: String(row.faculty_id ?? '').trim(),
    content: String(row.content ?? '').trim(),
    inputType: String(row.input_type ?? 'text').trim() === 'file' ? 'file' : 'text',
    fileName: row.file_name != null ? String(row.file_name).trim() || null : null,
    similarityScore: row.similarity_score != null ? Number(row.similarity_score) : 0,
    riskLevel: String(row.risk_level ?? 'Low').trim() || 'Low',
    flaggedSentences: parseFlaggedSentences(row.flagged_sentences),
    webSources: parseWebSources(row.web_sources),
    sourcesChecked: row.sources_checked != null ? Number(row.sources_checked) : 0,
    processingTimeMs: row.processing_time_ms != null ? Number(row.processing_time_ms) : 0,
    analysisMethod: String(row.analysis_method ?? 'TF-IDF + Cosine Similarity').trim(),
    aiProvider: String(row.ai_provider ?? 'none').trim() || 'none',
    lexicalScore: row.lexical_score != null ? Number(row.lexical_score) : null,
    semanticScore: row.semantic_score != null ? Number(row.semantic_score) : null,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at ?? null,
  }
}

const SAMPLE_REPORTS = [
  {
    content:
      'The quiet glow of the library lamps made the rainy evening feel strangely peaceful.',
    input_type: 'text',
    file_name: null,
    similarity_score: 0,
    risk_level: 'Low',
    flagged_sentences: [],
    web_sources: [],
    sources_checked: 0,
    processing_time_ms: 420,
    created_at: '2026-05-27T07:37:00.000Z',
  },
  {
    content:
      'Artificial intelligence is transforming education by enabling personalized learning paths, automating administrative tasks, and providing instant feedback to students. Machine learning models can analyze student performance data to identify knowledge gaps and recommend targeted resources. However, educators must balance technological innovation with human connection and ensure ethical use of AI tools in the classroom.',
    input_type: 'text',
    file_name: null,
    similarity_score: 90,
    risk_level: 'High',
    flagged_sentences: [
      {
        sentence:
          'Artificial intelligence is transforming education by enabling personalized learning paths, automating administrative tasks, and providing instant feedback to students.',
        similarity: 92,
        source_url: '',
        source_title: '',
      },
      {
        sentence:
          'Machine learning models can analyze student performance data to identify knowledge gaps and recommend targeted resources.',
        similarity: 88,
        source_url: '',
        source_title: '',
      },
    ],
    web_sources: [],
    sources_checked: 0,
    processing_time_ms: 680,
    created_at: '2026-05-27T07:36:00.000Z',
  },
]

export async function seedSampleReportsForFaculty(pool, facultyId) {
  const fid = String(facultyId ?? '').trim()
  if (!fid) return
  const { rows } = await pool.query(
    `SELECT 1 FROM plagiarism_reports WHERE faculty_id::text = $1::text LIMIT 1`,
    [fid],
  )
  if (rows?.length) return

  for (const sample of SAMPLE_REPORTS) {
    await pool.query(
      `
        INSERT INTO plagiarism_reports (
          faculty_id, content, input_type, file_name, similarity_score, risk_level,
          flagged_sentences, web_sources, sources_checked, processing_time_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11::timestamptz)
      `,
      [
        fid,
        sample.content,
        sample.input_type,
        sample.file_name,
        sample.similarity_score,
        sample.risk_level,
        JSON.stringify(sample.flagged_sentences),
        JSON.stringify(sample.web_sources),
        sample.sources_checked,
        sample.processing_time_ms,
        sample.created_at,
      ],
    )
  }
}

export async function listPlagiarismReports(pool, facultyId) {
  const { rows } = await pool.query(
    `
      SELECT ${REPORT_COLUMNS}
      FROM plagiarism_reports
      WHERE faculty_id::text = $1::text
      ORDER BY created_at DESC, id DESC
    `,
    [String(facultyId)],
  )
  return (rows || []).map(mapPlagiarismReportRow).filter(Boolean)
}

export async function fetchPlagiarismReportById(pool, id, facultyId) {
  const { rows } = await pool.query(
    `
      SELECT ${REPORT_COLUMNS}
      FROM plagiarism_reports
      WHERE id = $1 AND faculty_id::text = $2::text
      LIMIT 1
    `,
    [id, String(facultyId)],
  )
  return mapPlagiarismReportRow(rows?.[0])
}

/**
 * Server-side only — scores are computed by plagiarismEngine, never from client.
 * @param {import('pg').Pool} pool
 * @param {string} facultyId
 * @param {{
 *   content: string,
 *   inputType?: string,
 *   fileName?: string|null,
 *   similarityScore: number,
 *   riskLevel: string,
 *   flaggedSentences: object[],
 *   webSources: object[],
 *   sourcesChecked: number,
 *   processingTimeMs: number,
 *   analysisMethod?: string,
 *   aiProvider?: string,
 *   lexicalScore?: number|null,
 *   semanticScore?: number|null,
 * }} analysis
 */
export async function createPlagiarismReport(pool, facultyId, analysis) {
  const { rows } = await pool.query(
    `
      INSERT INTO plagiarism_reports (
        faculty_id, content, input_type, file_name, similarity_score, risk_level,
        flagged_sentences, web_sources, sources_checked, processing_time_ms,
        analysis_method, ai_provider, lexical_score, semantic_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13, $14)
      RETURNING ${REPORT_COLUMNS}
    `,
    [
      String(facultyId),
      String(analysis.content ?? '').trim(),
      String(analysis.inputType ?? 'text').trim() === 'file' ? 'file' : 'text',
      analysis.fileName ?? null,
      Number(analysis.similarityScore) || 0,
      String(analysis.riskLevel ?? 'Low').trim() || 'Low',
      JSON.stringify(Array.isArray(analysis.flaggedSentences) ? analysis.flaggedSentences : []),
      JSON.stringify(Array.isArray(analysis.webSources) ? analysis.webSources : []),
      Number(analysis.sourcesChecked) || 0,
      Number(analysis.processingTimeMs) || 0,
      String(analysis.analysisMethod ?? 'TF-IDF + Cosine Similarity').trim(),
      String(analysis.aiProvider ?? 'none').trim() || 'none',
      analysis.lexicalScore != null ? Number(analysis.lexicalScore) : null,
      analysis.semanticScore != null ? Number(analysis.semanticScore) : null,
    ],
  )
  return mapPlagiarismReportRow(rows?.[0])
}

export async function deletePlagiarismReport(pool, id, facultyId) {
  const { rowCount } = await pool.query(
    `DELETE FROM plagiarism_reports WHERE id = $1 AND faculty_id::text = $2::text`,
    [id, String(facultyId)],
  )
  return rowCount > 0
}
