/**
 * Delete a Better Auth user and related rows (sessions, accounts, etc.) from PostgreSQL.
 *
 *   node scripts/delete-auth-user-by-username.mjs faderek
 *   node scripts/delete-auth-user-by-username.mjs --email user@example.com
 */
import 'dotenv/config'
import pg from 'pg'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 2 })

async function findUser({ email, username }) {
  if (email) {
    const { rows } = await pool.query(
      'SELECT id, username, email, name, role FROM "user" WHERE LOWER(email) = LOWER($1)',
      [email],
    )
    return rows[0]
  }
  const { rows } = await pool.query(
    'SELECT id, username, email, name, role FROM "user" WHERE LOWER(username) = LOWER($1)',
    [username],
  )
  return rows[0]
}

async function deleteUserGraph(userId) {
  const id = String(userId)
  const attempts = [
    ['session', '"userId"'],
    ['account', '"userId"'],
    ['twoFactor', '"userId"'],
  ]
  for (const [table, col] of attempts) {
    try {
      const r = await pool.query(`DELETE FROM "${table}" WHERE ${col} = $1`, [id])
      if (r.rowCount) console.log(`  deleted from "${table}":`, r.rowCount)
    } catch (e) {
      const m = String(e?.message || e)
      if (m.includes('does not exist') || m.includes('column')) continue
      throw e
    }
  }
  try {
    const r = await pool.query('DELETE FROM verification WHERE "userId" = $1', [id])
    if (r.rowCount) console.log('  deleted from verification:', r.rowCount)
  } catch {
    /* optional table / column */
  }
  await pool.query('DELETE FROM "user" WHERE id = $1', [id])
}

async function main() {
  const argv = process.argv.slice(2)
  let username = ''
  let email = ''
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--email' && argv[i + 1]) {
      email = String(argv[++i] || '')
        .trim()
        .toLowerCase()
      continue
    }
    if (argv[i]?.startsWith('-')) continue
    if (!username) username = String(argv[i] || '').trim()
  }

  if (!username && !email) {
    console.error('Usage: node scripts/delete-auth-user-by-username.mjs <username>')
    console.error('   or: node scripts/delete-auth-user-by-username.mjs --email user@example.com')
    process.exit(1)
  }

  const row = await findUser({ email, username })
  if (!row?.id) {
    const label = email ? `email "${email}"` : `username "${username}"`
    console.error(`No user with ${label} in DATABASE_URL database`)
    const { rows: allUsers } = await pool.query(
      'SELECT username, email, name, role FROM "user" ORDER BY username LIMIT 50',
    )
    if (allUsers.length) {
      console.error('Existing users (username / email):')
      for (const u of allUsers) {
        console.error(`  - ${u.username}  <${u.email}>  (${u.name})  role=${u.role}`)
      }
    }
    await pool.end().catch(() => {})
    process.exit(1)
  }
  const userId = String(row.id)
  console.log('Deleting user:', { id: userId, ...row })

  await deleteUserGraph(userId)
  console.log(`Removed user "${row.username}" (${userId})`)

  await pool.end().catch(() => {})
}

main().catch(async (e) => {
  console.error(e)
  await pool.end().catch(() => {})
  process.exit(1)
})
