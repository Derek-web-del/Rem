import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isInstituteStaffRole,
  canAccessFacultyPhotoFiles,
} from '../server/lib/portalFileAccess.js'
import { isStoredFacultyPhotoPath } from '../server/lib/facultyPhotoStorage.js'

describe('portalFileAccess', () => {
  it('treats admin and registrar as institute staff', () => {
    assert.equal(isInstituteStaffRole('admin'), true)
    assert.equal(isInstituteStaffRole('registrar'), true)
    assert.equal(isInstituteStaffRole('teacher'), false)
  })

  it('allows faculty photo file access for roster and portal roles', () => {
    assert.equal(canAccessFacultyPhotoFiles('registrar'), true)
    assert.equal(canAccessFacultyPhotoFiles('admin'), true)
    assert.equal(canAccessFacultyPhotoFiles('teacher'), true)
    assert.equal(canAccessFacultyPhotoFiles('student'), true)
    assert.equal(canAccessFacultyPhotoFiles('guest'), false)
  })
})

describe('faculty photo storage paths', () => {
  it('recognizes persisted faculty upload paths', () => {
    assert.equal(isStoredFacultyPhotoPath('/uploads/faculties/faculty_abc_123.jpg'), true)
  })
})
