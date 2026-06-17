import fs from 'node:fs'
import path from 'node:path'
import { resolvePublicUploadPath } from './uploadPaths.js'

export function parseSyllabusDataUrl(dataUrl) {
  const t = String(dataUrl || '').trim()
  const m = /^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,([\s\S]*)$/i.exec(t)
  if (!m) return null
  return { mime: m[1] || 'application/octet-stream', buffer: Buffer.from(m[2], 'base64') }
}

export function syllabusDisplayFileName(syllabusRaw, subjectCode) {
  const t = String(syllabusRaw || '').trim()
  if (!t) return 'syllabus.pdf'
  if (t.startsWith('/uploads/')) {
    const base = t.split('/').pop()
    if (base) return base
  }
  if (t.startsWith('data:')) {
    const code = String(subjectCode ?? '').trim()
    if (t.includes('application/pdf') || t.includes('pdf')) return code ? `${code}.pdf` : 'syllabus.pdf'
    if (t.includes('wordprocessingml') || t.includes('msword')) return code ? `${code}.docx` : 'syllabus.docx'
    return code ? `${code}.pdf` : 'syllabus.pdf'
  }
  const code = String(subjectCode ?? '').trim()
  return code ? `${code}.pdf` : 'syllabus.pdf'
}

/**
 * Stream a subject syllabus (base64 data URL or disk path) for inline PDF viewing.
 * @param {import('express').Response} res
 * @param {string} syllabusRaw
 * @param {string} [downloadName]
 * @param {{ successField?: boolean }} [options]
 */
export function sendSubjectSyllabusResponse(res, syllabusRaw, downloadName, { successField = false } = {}) {
  const err = (status, error, message) => {
    res.status(status).json(successField ? { success: false, error, message } : { error, message })
  }

  const t = String(syllabusRaw || '').trim()
  if (!t) {
    err(404, 'NOT_FOUND', 'No syllabus file.')
    return
  }
  const fileName = String(downloadName || 'syllabus.pdf').replace(/[^\w.\-()+ ]+/g, '_') || 'syllabus.pdf'
  if (t.startsWith('data:')) {
    const parsed = parseSyllabusDataUrl(t)
    if (!parsed) {
      err(500, 'INVALID_SYLLABUS', 'Invalid syllabus data.')
      return
    }
    res.setHeader('Content-Type', parsed.mime)
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    res.send(parsed.buffer)
    return
  }
  if (t.startsWith('/uploads/')) {
    const abs = resolvePublicUploadPath(t)
    if (!abs || !fs.existsSync(abs)) {
      err(404, 'NOT_FOUND', 'Syllabus file missing on disk.')
      return
    }
    const ext = path.extname(abs).toLowerCase()
    if (ext === '.pdf') res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `inline; filename="${fileName}"`)
    res.sendFile(abs)
    return
  }
  err(404, 'NOT_FOUND', 'Unsupported syllabus format.')
}

/** Student API error envelope (`success: false`). */
export function sendStudentSubjectSyllabusResponse(res, syllabusRaw, downloadName) {
  return sendSubjectSyllabusResponse(res, syllabusRaw, downloadName, { successField: true })
}
