import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  mapCurriculumGuideList,
  mapCurriculumGuideToDashboard,
  normalizeCurriculumList,
} from '../Frontend/src/modules/curriculum/curriculumGuideMapping.js'

describe('admin curriculum persistence mapping', () => {
  it('maps curriculum_guides API row to dashboard shape with resolved file URL', () => {
    const row = {
      id: 'abc-123',
      title: 'English',
      subject: 'English',
      grade_level: 'Grade 10',
      description: 'Grade 10 English guide',
      file_name: 'English_G10.pdf',
      file_url: '/uploads/curriculum/English_G10-deadbeef.pdf',
      is_published: true,
      uploaded_by_name: 'Admin User',
      created_at: '2026-06-15T10:00:00.000Z',
      source: 'admin_upload',
    }
    const mapped = mapCurriculumGuideToDashboard(row, (p) => `http://localhost:5173${p}`)
    assert.equal(mapped.id, 'abc-123')
    assert.equal(mapped.grade, 'Grade 10')
    assert.equal(mapped.subject, 'English')
    assert.equal(mapped.description, 'Grade 10 English guide')
    assert.equal(mapped.fileDataUrl, 'http://localhost:5173/uploads/curriculum/English_G10-deadbeef.pdf')
    assert.equal(mapped.isPublished, true)
  })

  it('maps a list of guides', () => {
    const list = mapCurriculumGuideList(
      [
        { id: '1', subject: 'Math', grade_level: 'Grade 9', file_url: '/uploads/curriculum/a.pdf' },
        { id: '2', subject: 'Science', grade_level: 'Grade 9', file_url: '/uploads/curriculum/b.pdf' },
      ],
      (p) => p,
    )
    assert.equal(list.length, 2)
    assert.equal(list[0].subject, 'Math')
    assert.equal(list[1].subject, 'Science')
  })

  it('still normalizes legacy app_state curriculum rows', () => {
    const legacy = normalizeCurriculumList([
      { id: 'legacy-1', grade: 'Grade 8', subject: 'Filipino', fileName: 'fil.pdf', fileDataUrl: 'data:application/pdf;base64,abc' },
    ])
    assert.equal(legacy.length, 1)
    assert.equal(legacy[0].grade, 'Grade 8')
    assert.equal(legacy[0].subject, 'Filipino')
  })
})
