import pg from 'pg'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 })

async function main() {
  const logs = await pool.query(
    `SELECT "activityType", COUNT(*)::int AS c FROM lms_activity_logs GROUP BY "activityType" ORDER BY c DESC LIMIT 15`,
  )
  console.log('LMS activity types:', logs.rows)

  const quiz = await pool.query(
    `SELECT "activityType", COUNT(*)::int AS c FROM lms_activity_logs WHERE "activityType" ILIKE '%QUIZ%' GROUP BY 1`,
  )
  console.log('Quiz events:', quiz.rows)

  const recent = await pool.query(
    `SELECT "activityType", created_at FROM lms_activity_logs ORDER BY created_at DESC LIMIT 10`,
  )
  console.log('Recent logs:', recent.rows)

  const u = await pool.query(`SELECT id, username, email, "twoFactorEnabled" FROM "user" WHERE username IN ('faderek','livefaculty','admin')`)
  console.log('Users:', u.rows)

  const faderekFac = await pool.query(
    `SELECT f.id, f.email, f.auth_user_id FROM faculties f WHERE LOWER(f.email) LIKE '%jbukele%' OR f.auth_user_id IS NOT NULL LIMIT 5`,
  )
  console.log('Faculties sample:', faderekFac.rows)

  await pool.end()
}

main().catch((e) => { console.error(e); process.exit(1) })
