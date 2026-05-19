import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  normalizeSubjectImageKey,
  resolveSubjectImageFromMap,
  SUBJECT_IMAGE_MAP,
  SUBJECT_IMAGE_PLACEHOLDER,
  subjectImages,
} from '../shared/subjectImages.js'
import { resolveSubjectImagePath } from '../server/lib/subjectImageStorage.js'

describe('subjectImages shared map', () => {
  it('normalizes subject names case-insensitively', () => {
    assert.equal(normalizeSubjectImageKey('English'), 'english')
    assert.equal(normalizeSubjectImageKey('  Grade 7 Math '), 'grade7math')
  })

  it('maps known subjects to upload paths', () => {
    assert.equal(resolveSubjectImageFromMap('English'), SUBJECT_IMAGE_MAP.English)
    assert.equal(resolveSubjectImageFromMap('MATH'), SUBJECT_IMAGE_MAP.Math)
    assert.equal(resolveSubjectImageFromMap('filipino'), SUBJECT_IMAGE_MAP.Filipino)
  })

  it('returns placeholder for unknown subjects', () => {
    assert.equal(resolveSubjectImageFromMap('Unknown Subject'), SUBJECT_IMAGE_PLACEHOLDER)
  })
})

describe('resolveSubjectImagePath (server)', () => {
  it('matches English_Logo.png for English', () => {
    const path = resolveSubjectImagePath('English')
    assert.match(path, /\/uploads\/Subjects_images\/English_Logo\.png$/i)
  })

  it('matches Science_Logo.png case-insensitively', () => {
    const path = resolveSubjectImagePath('science')
    assert.match(path, /\/uploads\/Subjects_images\/Science_Logo\.png$/i)
  })

  it('falls back to placeholder when no file exists', () => {
    assert.equal(resolveSubjectImagePath('History'), SUBJECT_IMAGE_PLACEHOLDER)
  })
})
