#!/usr/bin/env node
/**
 * One-time migration: encrypt existing plaintext student PII columns.
 * Idempotent — skips values already prefixed with enc:v1:
 *
 *   node --env-file=.env scripts/encrypt-existing-student-pii.mjs
 */
import { getPgPool, closePgPool } from '../server/pgPool.js'
import {
  encryptStudentPiiFields,
  isEncryptedValue,
  STUDENT_PII_FIELDS,
} from '../server/lib/studentPiiCrypto.js'
import { isAesConfigured } from '../server/lib/aes256.js'

const BATCH = 50

function needsEncryption(row) {
  for (const field of STUDENT_PII_FIELDS) {
    const v = row[field]
    if (v == null || String(v).trim() === '') continue
    if (!isEncryptedValue(String(v))) return true
  }
  return false
}

async function main() {
  if (!isAesConfigured()) {
    console.error('[encrypt-pii] AES_256_SECRET_KEY is not set. Aborting.')
    process.exit(1)
  }
  const pool = getPgPool()
  if (!pool) {
    console.error('[encrypt-pii] DATABASE_URL is not configured.')
    process.exit(1)
  }

  const { rows: all } = await pool.query(
    `SELECT id, first_name, last_name, contact_no, parent_contact, dob, address FROM students`,
  )
  const pending = (all || []).filter(needsEncryption)
  console.log(`[encrypt-pii] ${pending.length} of ${all?.length ?? 0} students need encryption.`)

  let updated = 0
  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH)
    for (const row of batch) {
      const enc = encryptStudentPiiFields({
        ...row,
        dob: row.dob instanceof Date ? row.dob.toISOString().slice(0, 10) : row.dob,
      })
      await pool.query(
        `
          UPDATE students
          SET first_name = $1, last_name = $2, contact_no = $3,
              parent_contact = $4, dob = $5, address = $6
          WHERE id = $7
        `,
        [
          enc.first_name,
          enc.last_name,
          enc.contact_no,
          enc.parent_contact,
          enc.dob,
          enc.address,
          row.id,
        ],
      )
      updated += 1
    }
    console.log(`[encrypt-pii] progress ${Math.min(i + BATCH, pending.length)}/${pending.length}`)
  }

  console.log(`[encrypt-pii] Done. Encrypted ${updated} student row(s).`)
  await closePgPool()
}

main().catch((e) => {
  console.error('[encrypt-pii] failed:', e?.message || e)
  process.exit(1)
})
