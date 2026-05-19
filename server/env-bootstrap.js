import dotenv from 'dotenv'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __serverDir = path.dirname(fileURLToPath(import.meta.url))

/**
 * Absolute paths probed for `.env` (in order): repo root (parent of `server/`), then cwd.
 * Exported so startup can log them if `DATABASE_URL` is still missing.
 */
export const LENLEARN_DOTENV_CANDIDATES = [
  path.resolve(__serverDir, '..', '.env'),
  path.resolve(process.cwd(), '.env'),
]

let loadedFrom = ''

for (const candidate of LENLEARN_DOTENV_CANDIDATES) {
  if (fs.existsSync(candidate)) {
    dotenv.config({ path: candidate })
    loadedFrom = candidate
    break
  }
}

if (!loadedFrom) {
  dotenv.config()
  loadedFrom = `(no .env file at candidates; dotenv defaulted to cwd: ${process.cwd()})`
}

/** Human-readable description of which path dotenv used (or fallback). */
export const LENLEARN_DOTENV_LOADED_FROM = loadedFrom
