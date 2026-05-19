/**
 * Remove default Glendale demo faculty from PostgreSQL + app_state JSON.
 *
 *   npm run purge:demo-teacher
 *
 * Targets: teacher@glendale.edu, Better Auth username "teacher".
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const DEMO_EMAIL = 'teacher@glendale.edu'
const DEMO_USERNAME = 'teacher'

const url = String(process.env.DATABASE_URL || '').trim()
if (!url) {
  console.error('Set DATABASE_URL in .env')
  process.exit(1)
}

const pool = new pg.Pool({ connectionString: url, max: 2 })

async function deleteAuthUserGraph(client, userId) {
  const id = String(userId)
  for (const table of ['session', 'account', 'twoFactor']) {
    try {
      const r = await client.query(`DELETE FROM "${table}" WHERE "userId" = $1`, [id])
      if (r.rowCount) console.log(`  "${table}":`, r.rowCount)
    } catch (e) {
      const m = String(e?.message || e)
      if (!m.includes('does not exist')) throw e
    }
  }
  try {
    await client.query('DELETE FROM verification WHERE "userId" = $1', [id])
  } catch {
    /* optional */
  }
  await client.query('DELETE FROM "user" WHERE id = $1', [id])
}

async function scrubAppStateFaculties(client) {
  const { rows } = await client.query(`SELECT json FROM app_state WHERE id = 'default'`)
  if (!rows[0]?.json) return 0
  let state
  try {
    state = JSON.parse(rows[0].json)
  } catch {
    console.warn('[purge:demo-teacher] app_state.default JSON parse failed — skipped')
    return 0
  }
  if (!Array.isArray(state.faculties)) return 0
  const before = state.faculties.length
  state.faculties = state.faculties.filter((f) => {
    const email = String(f?.email || '').trim().toLowerCase()
    const uname = String(f?.facultyUsername || f?.username || '').trim().toLowerCase()
    return email !== DEMO_EMAIL && uname !== DEMO_USERNAME
  })
  const removed = before - state.faculties.length
  if (removed > 0) {
    await client.query(`UPDATE app_state SET json = $1, updated_at = NOW() WHERE id = 'default'`, [
      JSON.stringify(state),
    ])
  }
  return removed
}

async function main() {
  const sqlPath = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../Database/migrations/007_purge_demo_teacher_account.sql',
  )
  const sqlFile = fs.readFileSync(sqlPath, 'utf8')
  console.log('[purge:demo-teacher] Running SQL migration…')
  await pool.query(sqlFile)

  const client = await pool.connect()
  try {
    const removedFromJson = await scrubAppStateFaculties(client)
    if (removedFromJson) {
      console.log(`[purge:demo-teacher] Removed ${removedFromJson} faculty entr(y/ies) from app_state.default`)
    }

    const { rows: leftover } = await client.query(
      `SELECT id, username, email FROM "user"
       WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($2)`,
      [DEMO_EMAIL, DEMO_USERNAME],
    )
    if (leftover.length) {
      console.log('[purge:demo-teacher] Cleaning leftover auth rows…')
      for (const u of leftover) {
        await deleteAuthUserGraph(client, u.id)
        console.log(`  removed auth user ${u.username} <${u.email}>`)
      }
    }

    const { rows: facLeft } = await client.query(
      `SELECT id, email, name FROM public.faculties
       WHERE LOWER(email) = LOWER($1) OR LOWER(COALESCE(faculty_username, '')) = LOWER($2)`,
      [DEMO_EMAIL, DEMO_USERNAME],
    )
    if (facLeft.length) {
      for (const f of facLeft) {
        await client.query('DELETE FROM public.faculty_sections WHERE faculty_id = $1', [f.id])
        await client.query('DELETE FROM public.faculties WHERE id = $1', [f.id])
        console.log(`  removed faculty ${f.name} <${f.email}>`)
      }
    }
  } finally {
    client.release()
  }

  console.log('[purge:demo-teacher] Done. Demo teacher account purged from database.')
  await pool.end().catch(() => {})
}

main().catch(async (e) => {
  console.error(e)
  await pool.end().catch(() => {})
  process.exit(1)
})
