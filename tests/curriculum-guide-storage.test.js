import { describe, expect, it } from 'vitest'
import { validateCurriculumGuideFile } from '../server/lib/curriculumGuideStorage.js'

describe('curriculumGuideStorage', () => {
  it('accepts PDF curriculum guide files', () => {
    const err = validateCurriculumGuideFile({
      originalname: 'guide.pdf',
      size: 1024,
      buffer: Buffer.from('%PDF-1.4'),
    })
    expect(err).toBe('')
  })

  it('rejects DOC and DOCX curriculum guide files', () => {
    for (const name of ['guide.doc', 'guide.docx']) {
      const err = validateCurriculumGuideFile({
        originalname: name,
        size: 1024,
        buffer: Buffer.from('fake'),
      })
      expect(err).toBe('File must be PDF.')
    }
  })
})
