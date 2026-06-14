import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const TEST_KEY = crypto.randomBytes(32).toString('hex')

let aes
let pii
let shared
let mapSubmissionRow
let mapActivitySubmissionRow

before(async () => {
  process.env.AES_256_SECRET_KEY = TEST_KEY
  aes = await import('../server/lib/aes256.js')
  pii = await import('../server/lib/studentPiiCrypto.js')
  shared = await import('../server/api/state/shared.js')
  ;({ mapSubmissionRow } = await import('../server/lib/assignmentsDb.js'))
  ;({ mapActivitySubmissionRow } = await import('../server/lib/activitiesDb.js'))
})

after(() => {
  delete process.env.AES_256_SECRET_KEY
})

describe('aes256', () => {
  it('round-trips encrypt/decrypt', () => {
    const plain = 'Maria Santos'
    const enc = aes.encrypt(plain)
    assert.ok(aes.isEncryptedValue(enc))
    assert.equal(aes.decrypt(enc), plain)
  })

  it('returns null for empty input', () => {
    assert.equal(aes.encrypt(''), null)
    assert.equal(aes.decrypt(''), null)
  })

  it('is idempotent on already-encrypted values', () => {
    const enc = aes.encrypt('test')
    assert.equal(aes.encrypt(enc), enc)
  })
})

describe('studentPiiCrypto', () => {
  it('encrypts and decrypts student fields', () => {
    const row = {
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      contact_no: '09171234567',
      parent_contact: '09179876543',
      dob: '2010-05-15',
      address: '123 Main St',
      email: 'juan@school.edu',
    }
    const enc = pii.encryptStudentPiiFields(row)
    assert.ok(pii.isEncryptedValue(String(enc.first_name)))
    assert.equal(enc.email, 'juan@school.edu')

    const dec = pii.decryptStudentPiiFields(enc)
    assert.equal(dec.first_name, 'Juan')
    assert.equal(dec.last_name, 'Dela Cruz')
    assert.equal(dec.contact_no, '09171234567')
    assert.equal(dec.dob, '2010-05-15')
  })

  it('decryptStudentRows maps arrays', () => {
    const enc = pii.encryptStudentPiiFields({ first_name: 'Ana', last_name: 'Lopez' })
    const rows = pii.decryptStudentRows([enc])
    assert.equal(rows[0].first_name, 'Ana')
  })

  it('obfuscateArchivedStudentForVault returns plaintext names for encrypted rows', () => {
    const enc = pii.encryptStudentPiiFields({
      id: 1,
      first_name: 'Juan',
      middle_name: 'Huyan',
      last_name: 'Cruz',
      archived_at: '2025-06-01T12:00:00.000Z',
    })
    assert.ok(pii.isEncryptedValue(String(enc.first_name)))
    assert.ok(pii.isEncryptedValue(String(enc.last_name)))

    const vault = shared.obfuscateArchivedStudentForVault(enc)
    assert.equal(vault.name, 'Juan Huyan Cruz')
    assert.equal(vault.first_name, 'Juan')
    assert.equal(vault.middle_name, 'Huyan')
    assert.equal(vault.last_name, 'Cruz')
    assert.ok(!vault.name.includes('enc:v1:'))
    assert.equal(vault.email, shared.VAULT_OBFUSCATED_LABEL)
  })

  it('submissionStudentDisplayName decrypts joined student fields', () => {
    const enc = pii.encryptStudentPiiFields({
      first_name: 'Maria',
      middle_name: 'Ann',
      last_name: 'Santos',
    })
    const name = pii.submissionStudentDisplayName({
      first_name: enc.first_name,
      middle_name: enc.middle_name,
      last_name: enc.last_name,
      student_name: `${enc.first_name} ${enc.last_name}`,
    })
    assert.equal(name, 'Maria Ann Santos')
    assert.ok(!name.includes('enc:v1:'))
  })

  it('submissionStudentDisplayName ignores cached ciphertext without joined fields', () => {
    const enc = pii.encryptStudentPiiFields({ first_name: 'Trap', last_name: 'Hook' })
    const cached = `${enc.first_name} ${enc.last_name}`
    assert.equal(pii.submissionStudentDisplayName({ student_name: cached }), '')
  })

  it('decryptStudentPiiFields decrypts date_of_birth alias to dob and back', () => {
    const encDob = aes.encrypt('2010-05-15')
    const dec = pii.decryptStudentPiiFields({ date_of_birth: encDob })
    assert.equal(dec.dob, '2010-05-15')
    assert.equal(dec.date_of_birth, '2010-05-15')
    assert.ok(!String(dec.date_of_birth).includes('enc:v1:'))
  })

  it('studentDisplayName ignores stale SQL full_name concat with ciphertext', () => {
    const enc = pii.encryptStudentPiiFields({
      first_name: 'Juan',
      middle_name: 'Huyan',
      last_name: 'Cruz',
    })
    const staleFullName = `${enc.first_name} Huyan ${enc.last_name}`
    const name = pii.studentDisplayName({
      first_name: enc.first_name,
      middle_name: 'Huyan',
      last_name: enc.last_name,
      full_name: staleFullName,
    })
    assert.equal(name, 'Juan Huyan Cruz')
    assert.ok(!name.includes('enc:v1:'))
  })
})

describe('submission student name mapping', () => {
  it('mapSubmissionRow returns plaintext from joined encrypted student PII', () => {
    const enc = pii.encryptStudentPiiFields({
      first_name: 'Juan',
      middle_name: 'Huyan',
      last_name: 'Cruz',
    })
    const mapped = mapSubmissionRow({
      id: 1,
      assignment_id: 10,
      student_id: 5,
      student_name: `${enc.first_name} ${enc.last_name}`,
      first_name: enc.first_name,
      middle_name: enc.middle_name,
      last_name: enc.last_name,
      status: 'not_submitted',
    })
    assert.equal(mapped.student_name, 'Juan Huyan Cruz')
    assert.ok(!mapped.student_name.includes('enc:v1:'))
  })

  it('mapActivitySubmissionRow returns plaintext from joined encrypted student PII', () => {
    const enc = pii.encryptStudentPiiFields({
      first_name: 'Liza',
      last_name: 'Mendoza',
    })
    const mapped = mapActivitySubmissionRow({
      id: 2,
      activity_id: 20,
      student_id: 7,
      student_name: `${enc.first_name} ${enc.last_name}`,
      first_name: enc.first_name,
      middle_name: enc.middle_name,
      last_name: enc.last_name,
      status: 'submitted',
    })
    assert.equal(mapped.student_name, 'Liza Mendoza')
    assert.ok(!mapped.student_name.includes('enc:v1:'))
  })
})
