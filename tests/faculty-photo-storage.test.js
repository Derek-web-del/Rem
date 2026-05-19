import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  FACULTY_UPLOAD_REL,
  getFacultyUploadDir,
  isFacultyPhotoDataUrl,
  isStoredFacultyPhotoPath,
  saveFacultyPhotoBuffer,
  saveFacultyPhotoFromDataUrl,
} from '../server/lib/facultyPhotoStorage.js'

describe('facultyPhotoStorage', () => {
  it('detects data URLs and stored paths', () => {
    assert.equal(isFacultyPhotoDataUrl('data:image/png;base64,abc'), true)
    assert.equal(isStoredFacultyPhotoPath(`${FACULTY_UPLOAD_REL}/faculty_1_1.png`), true)
    assert.equal(isStoredFacultyPhotoPath('/other/x.png'), false)
  })

  it('saves a PNG buffer under public/uploads/faculties', async () => {
    const tinyPng = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64',
    )
    const rel = await saveFacultyPhotoBuffer(tinyPng, 'image/png', 'test-faculty')
    assert.ok(isStoredFacultyPhotoPath(rel))
    const abs = path.join(getFacultyUploadDir(), path.basename(rel))
    assert.ok(fs.existsSync(abs))
    await fs.promises.unlink(abs).catch(() => {})
  })

  it('converts a small data URL to a stored path', async () => {
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const rel = await saveFacultyPhotoFromDataUrl(dataUrl, 'legacy')
    assert.ok(isStoredFacultyPhotoPath(rel))
    const abs = path.join(getFacultyUploadDir(), path.basename(rel))
    await fs.promises.unlink(abs).catch(() => {})
  })
})
