import { getPgPool } from '../pgPool.js'
import { sendSafeServerError } from '../lib/safeApiError.js'
import { logUnauthorizedAccessFromRequest } from '../lib/security.js'
import { fetchFacultyRowForSession } from '../lib/facultySession.js'
import { enforceFacultyTermsAccepted } from '../lib/facultyTerms.js'
import { analyzeText } from '../lib/plagiarismEngine.js'
import {
  analyzeTextSemantic,
  getAiProvider,
  mergePlagiarismResults,
} from '../lib/plagiarismAiEngine.js'
import { getWebSources } from '../lib/webSourceFetcher.js'
import { parseFile } from '../lib/documentParser.js'
import { detectAiContent } from '../lib/aiContentDetector.js'
import { deriveAiScoresFromSimilarity } from '../../shared/aiProbabilityBands.js'
import {
  getOriginalityUploadFile,
  originalityUploadMiddleware,
} from '../lib/originalityStorage.js'
import {
  createPlagiarismReport,
  deletePlagiarismReport,
  ensurePlagiarismReportsSchema,
  fetchPlagiarismReportById,
  listPlagiarismReports,
  seedSampleReportsForFaculty,
} from '../lib/plagiarismReportsDb.js'
import {
  logTeacherAuditEvent,
  TEACHER_AUDIT_ACTIONS,
  TEACHER_AUDIT_MODULES,
} from '../lib/teacherAuditLog.js'
import { buildTargetLabel } from '../lib/teacherAuditSnapshots.js'
import { MULTER_MAX_BYTES } from '../lib/uploadLimitsConfig.js'

async function getSessionUser(req, auth) {
  if (!auth?.api?.getSession) return null
  const session = await auth.api.getSession({ headers: req.headers })
  return (
    session?.user ?? session?.data?.user ?? session?.session?.user ?? session?.data?.session?.user ?? null
  )
}

async function requireFacultySession(req, res, auth) {
  if (!auth?.api?.getSession) {
    res.status(503).json({ success: false, error: 'AUTH_UNAVAILABLE', message: 'Authentication is unavailable.' })
    return null
  }
  try {
    const u = await getSessionUser(req, auth)
    if (!u?.id) {
      res.status(401).json({ success: false, error: 'UNAUTHORIZED', message: 'Sign-in required.' })
      return null
    }
    const role = String(u.role || '').trim().toLowerCase()
    if (role !== 'teacher' && role !== 'faculty') {
      logUnauthorizedAccessFromRequest(req, {
        reason: 'Plagiarism reports API requires teacher/faculty role',
        requiredRole: 'faculty',
      })
      res.status(403).json({ success: false, error: 'FORBIDDEN', message: 'Access denied. Faculty only.' })
      return null
    }
    const pool = getPgPool()
    if (!(await enforceFacultyTermsAccepted(req, res, pool, u))) return null
    return { user: u }
  } catch (e) {
    sendSafeServerError(res, e, 'plagiarism-reports faculty session gate')
    return null
  }
}

function parseIdParam(raw) {
  const id = Number(raw)
  if (!Number.isFinite(id) || id <= 0) return null
  return id
}

function parseRunAiDetection(raw) {
  if (raw === true || raw === 1 || raw === '1') return true
  if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true'
  return false
}

export function createPlagiarismReportsV1Router(express, auth) {
  const router = express.Router()

  router.get('/v1/plagiarism-reports', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensurePlagiarismReportsSchema(pool)
      await seedSampleReportsForFaculty(pool, facultyRow.id)
      const reports = await listPlagiarismReports(pool, facultyRow.id)
      res.json({ success: true, reports })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/plagiarism-reports')
    }
  })

  router.get('/v1/plagiarism-reports/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid report id.' })
        return
      }
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensurePlagiarismReportsSchema(pool)
      const report = await fetchPlagiarismReportById(pool, id, facultyRow.id)
      if (!report) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Report not found.' })
        return
      }
      res.json({ success: true, report })
    } catch (e) {
      sendSafeServerError(res, e, 'GET /api/v1/plagiarism-reports/:id')
    }
  })

  router.post('/v1/plagiarism-reports', originalityUploadMiddleware, async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return

      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }

      await ensurePlagiarismReportsSchema(pool)

      const uploadFile = getOriginalityUploadFile(req)
      const inputType = uploadFile ? 'file' : 'text'
      const startTime = Date.now()

      let submittedText = ''
      let fileName = null

      if (inputType === 'file') {
        const parsed = await parseFile(uploadFile.path, uploadFile.mimetype, uploadFile.originalname)
        if (!parsed.text) {
          res.status(400).json({
            success: false,
            error: 'BAD_REQUEST',
            message: parsed.error || 'Could not extract text from file or file too short.',
          })
          return
        }
        submittedText = parsed.text
        fileName = uploadFile.originalname
      } else {
        submittedText = String(req.body?.content ?? '').trim()
        if (!submittedText || submittedText.length < 50) {
          res.status(400).json({
            success: false,
            error: 'BAD_REQUEST',
            message: 'Text too short. Minimum 50 characters required.',
          })
          return
        }
        if (Buffer.byteLength(submittedText, 'utf8') > MULTER_MAX_BYTES) {
          res.status(400).json({
            success: false,
            error: 'BAD_REQUEST',
            message: 'File upload failed.',
          })
          return
        }
      }

      const webSources = await getWebSources(submittedText)
      const lexicalAnalysis = analyzeText(submittedText, webSources)
      const aiProvider = getAiProvider()
      let semanticAnalysis = null
      if (aiProvider !== 'none') {
        try {
          semanticAnalysis = await analyzeTextSemantic(submittedText, webSources)
        } catch (semanticErr) {
          console.error('[plagiarism] Semantic analysis failed — using lexical only:', semanticErr?.message || semanticErr)
        }
      }
      const analysis = mergePlagiarismResults(lexicalAnalysis, semanticAnalysis, aiProvider)

      const runAiDetection = parseRunAiDetection(req.body?.run_ai_detection)
      let aiDetectionResult = null
      if (runAiDetection) {
        const rawAi = detectAiContent(submittedText)
        const derived = deriveAiScoresFromSimilarity(analysis.similarity_score)
        aiDetectionResult = derived
          ? {
              ...rawAi,
              probability: derived.probability,
              lexical_score: derived.lexical_score,
              semantic_score: derived.semantic_score,
              verdict: derived.verdict,
            }
          : rawAi
      }

      const processingTimeMs = Date.now() - startTime

      const report = await createPlagiarismReport(pool, facultyRow.id, {
        content: submittedText,
        inputType,
        fileName,
        similarityScore: analysis.similarity_score,
        riskLevel: analysis.risk_level,
        flaggedSentences: analysis.flagged_sentences,
        webSources: analysis.web_sources,
        sourcesChecked: webSources.length,
        processingTimeMs,
        analysisMethod: analysis.analysis_method,
        aiProvider: analysis.ai_provider,
        lexicalScore: analysis.lexical_score,
        semanticScore: analysis.semantic_score,
        aiDetectionEnabled: runAiDetection,
        aiProbability: aiDetectionResult?.probability ?? null,
        aiLexicalScore: aiDetectionResult?.lexical_score ?? null,
        aiSemanticScore: aiDetectionResult?.semantic_score ?? null,
        aiVerdict: aiDetectionResult?.verdict ?? null,
        aiSentenceResults: aiDetectionResult?.sentences ?? null,
      })

      await logTeacherAuditEvent(req, {
        event_type: 'plagiarism_check_submitted',
        module: TEACHER_AUDIT_MODULES.PLAGIARISM,
        action: TEACHER_AUDIT_ACTIONS.CREATE,
        user: gate.user,
        facultyRow,
        target_id: report?.id,
        target_label: buildTargetLabel(fileName || 'Text submission'),
        new_values: {
          document_name: fileName || 'Text submission',
          similarity_score: analysis.similarity_score,
          risk_level: analysis.risk_level,
          ai_detection_ran: runAiDetection,
          ...(runAiDetection && aiDetectionResult?.probability != null
            ? { ai_probability: aiDetectionResult.probability }
            : {}),
        },
      })

      res.status(201).json({
        success: true,
        report_id: report.id,
        report,
        similarity_score: analysis.similarity_score,
        risk_level: analysis.risk_level,
        flagged_sentences: analysis.flagged_sentences,
        web_sources: analysis.web_sources,
        sources_checked: webSources.length,
        processing_time_ms: processingTimeMs,
        analysis_method: analysis.analysis_method,
        ai_provider: analysis.ai_provider,
        lexical_score: analysis.lexical_score,
        semantic_score: analysis.semantic_score,
        input_type: inputType,
        file_name: fileName,
        ai_detection_ran: runAiDetection,
        ai_probability: report.aiProbability ?? null,
        ai_lexical_score: report.aiLexicalScore ?? null,
        ai_semantic_score: report.aiSemanticScore ?? null,
        ai_verdict: report.aiVerdict ?? null,
        ai_sentence_results: report.aiSentenceResults ?? [],
      })
    } catch (e) {
      sendSafeServerError(res, e, 'POST /api/v1/plagiarism-reports')
    }
  })

  router.delete('/v1/plagiarism-reports/:id', async (req, res) => {
    try {
      const gate = await requireFacultySession(req, res, auth)
      if (!gate) return
      const id = parseIdParam(req.params.id)
      if (!id) {
        res.status(400).json({ success: false, error: 'BAD_REQUEST', message: 'Invalid report id.' })
        return
      }
      const pool = getPgPool()
      const facultyRow = await fetchFacultyRowForSession(pool, gate.user)
      if (!facultyRow?.id) {
        res.status(404).json({ success: false, error: 'FACULTY_NOT_FOUND', message: 'Faculty profile not linked.' })
        return
      }
      await ensurePlagiarismReportsSchema(pool)
      const existing = await fetchPlagiarismReportById(pool, id, facultyRow.id)
      const deleted = await deletePlagiarismReport(pool, id, facultyRow.id)
      if (!deleted) {
        res.status(404).json({ success: false, error: 'NOT_FOUND', message: 'Report not found.' })
        return
      }
      await logTeacherAuditEvent(req, {
        event_type: 'plagiarism_report_deleted',
        module: TEACHER_AUDIT_MODULES.PLAGIARISM,
        action: TEACHER_AUDIT_ACTIONS.DELETE,
        user: gate.user,
        facultyRow,
        target_id: id,
        target_label: buildTargetLabel(existing?.file_name || existing?.document_name || `Report ${id}`),
        old_values: {
          document_name: existing?.file_name || existing?.document_name || null,
          similarity_score: existing?.similarity_score ?? null,
        },
      })
      res.json({ success: true, message: 'Report deleted successfully.' })
    } catch (e) {
      sendSafeServerError(res, e, 'DELETE /api/v1/plagiarism-reports/:id')
    }
  })

  return router
}
