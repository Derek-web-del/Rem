import test, { describe } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import './load-test-env.js'
import {
  resolvePortalDisplayNameByEmail,
  syncAuthUserNameFromRoster,
} from '../server/lib/portalDisplayName.js'

const PG_TEST_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
const portalDescribe = PG_TEST_URL ? describe : describe.skip

function uniq(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

portalDescribe('portal display name by email', () => {
  test('prefers active student roster name over stale auth user.name', async () => {
    process.env.DATABASE_URL = PG_TEST_URL
    const pool = new pg.Pool({ connectionString: PG_TEST_URL, max: 1 })
    const email = `${uniq('joseph')}@example.com`

    try {
      const { rows: userRows } = await pool.query(
        `
          INSERT INTO "user" (id, name, email, role, "emailVerified", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, 'student', true, NOW(), NOW())
          RETURNING id
        `,
        [uniq('auth'), 'Trap Hook', email],
      )
      const authUserId = userRows[0].id

      await pool.query(
        `
          INSERT INTO students (
            first_name, middle_name, last_name, email, contact_no, address, dob,
            parent_contact, parent_email, enrollment_no, roll_no,
            grade_level, semester, login_id, password_hash, auth_user_id
          )
          VALUES ($1, $2, $3, $4, '09171234567', 'Test Address', '2010-01-01',
            '09179876543', 'parent@example.com', $5, '1',
            'Grade 7', '1st Semester', $6, 'x', $7)
        `,
        ['Joseph', '', 'Unias', email, uniq('en'), uniq('login'), authUserId],
      )

      const resolved = await resolvePortalDisplayNameByEmail(email)
      assert.equal(resolved, 'Joseph Unias')

      await syncAuthUserNameFromRoster(authUserId, resolved, 'Trap Hook')
      const { rows: after } = await pool.query(`SELECT name FROM "user" WHERE id = $1`, [authUserId])
      assert.equal(after[0]?.name, 'Joseph Unias')
    } finally {
      await pool.query(`DELETE FROM students WHERE lower(email) = lower($1)`, [email])
      await pool.query(`DELETE FROM "user" WHERE lower(email) = lower($1)`, [email])
      await pool.end()
    }
  })
})
