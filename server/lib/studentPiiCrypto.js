import { decrypt, encrypt, isAesConfigured, isEncryptedValue } from './aes256.js'

/** Columns encrypted at rest in public.students */
export const STUDENT_PII_FIELDS = [
  'first_name',
  'last_name',
  'contact_no',
  'parent_contact',
  'dob',
  'address',
]

export { isEncryptedValue }

/**
 * Encrypt PII fields on a student row/object before INSERT/UPDATE.
 * @param {Record<string, unknown> | null | undefined} row
 */
export function encryptStudentPiiFields(row) {
  if (!row || typeof row !== 'object' || !isAesConfigured()) return row
  const out = { ...row }
  for (const field of STUDENT_PII_FIELDS) {
    if (out[field] == null) continue
    if (field === 'dob' && out[field] instanceof Date) {
      out[field] = encrypt(out[field].toISOString().slice(0, 10))
      continue
    }
    const val = String(out[field]).trim()
    if (val) out[field] = encrypt(val)
  }
  return out
}

/**
 * Encrypt plain values for DB write (INSERT params).
 * @param {Record<string, string | null | undefined>} fields
 */
export function encryptStudentPiiValues(fields) {
  if (!isAesConfigured()) return fields
  const out = { ...fields }
  for (const field of STUDENT_PII_FIELDS) {
    if (out[field] == null || String(out[field]).trim() === '') continue
    out[field] = encrypt(String(out[field]).trim())
  }
  return out
}

/**
 * Decrypt PII fields on a student row before returning to API.
 * @param {Record<string, unknown> | null | undefined} row
 */
export function decryptStudentPiiFields(row) {
  if (!row || typeof row !== 'object' || !isAesConfigured()) return row
  const out = { ...row }
  if (out.dob == null && out.date_of_birth != null) {
    out.dob = out.date_of_birth
  }
  for (const field of STUDENT_PII_FIELDS) {
    if (out[field] == null) continue
    try {
      const decrypted = decrypt(String(out[field]))
      if (decrypted != null) out[field] = decrypted
    } catch (e) {
      console.warn(`[studentPiiCrypto] decrypt failed for ${field}:`, e?.message || e)
    }
  }
  if (out.dob != null) {
    out.date_of_birth = out.dob
  }
  return out
}

/** @param {Array<Record<string, unknown>> | null | undefined} rows */
export function decryptStudentRows(rows) {
  if (!Array.isArray(rows)) return rows
  return rows.map((r) => decryptStudentPiiFields(r))
}

/** Build display name from a student row (decrypts PII fields when configured). */
export function studentDisplayName(row) {
  if (!row || typeof row !== 'object') return ''
  const d = decryptStudentPiiFields(row)
  return [d.first_name, d.middle_name, d.last_name]
    .filter((v) => v != null && String(v).trim() !== '')
    .map((v) => String(v).trim())
    .join(' ')
    .trim()
}

/** Display name for assignment/activity submission rows (joins students PII when present). */
export function submissionStudentDisplayName(row) {
  if (!row || typeof row !== 'object') return ''
  const fromStudent = studentDisplayName({
    first_name: row.first_name,
    middle_name: row.middle_name,
    last_name: row.last_name,
  })
  if (fromStudent) return fromStudent
  const cached = String(row.student_name ?? '').trim()
  if (!cached || cached.includes('enc:v1:')) return ''
  return cached
}
