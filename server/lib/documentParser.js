import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const pdfParse = require('pdf-parse')

const MIN_TEXT_LENGTH = 50

/**
 * @param {string} filePath
 * @param {string} mimeType
 * @param {string} originalName
 * @returns {Promise<{ text: string | null, error: string | null }>}
 */
export async function parseFile(filePath, mimeType, originalName) {
  const abs = String(filePath || '').trim()
  const ext = path.extname(String(originalName || abs)).toLowerCase()
  const mime = String(mimeType || '').toLowerCase()

  try {
    let text = ''

    if (ext === '.txt' || mime === 'text/plain') {
      text = await fs.readFile(abs, 'utf-8')
    } else if (ext === '.pdf' || mime === 'application/pdf') {
      const buffer = fsSync.readFileSync(abs)
      const result = await pdfParse(buffer)
      text = String(result?.text || '')
    } else {
      return { text: null, error: 'Supported formats: .txt, .pdf' }
    }

    text = text.replace(/\s+/g, ' ').trim()

    if (text.length < MIN_TEXT_LENGTH) {
      return {
        text: null,
        error: `Could not extract enough text (minimum ${MIN_TEXT_LENGTH} characters required).`,
      }
    }

    return { text, error: null }
  } catch (e) {
    return { text: null, error: String(e?.message || 'Failed to parse file.') }
  } finally {
    try {
      await fs.unlink(abs)
    } catch {
      /* ignore cleanup errors */
    }
  }
}
