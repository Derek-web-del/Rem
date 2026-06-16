import pg from 'pg'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  console.error('[debug-subject-materials] DATABASE_URL is not set')
  process.exit(1)
}

const pool = new pg.Pool({
  connectionString,
})

const sid = 3

const sub = await pool.query(
  'SELECT id, faculty_id, length(syllabus_pdf) AS len FROM subjects WHERE id = $1',
  [sid],
)
console.log('subject:', sub.rows[0])

const fid = sub.rows[0]?.faculty_id
const own = await pool.query(
  'SELECT 1 AS ok FROM subjects WHERE id = $1 AND faculty_id::text = $2::text LIMIT 1',
  [sid, String(fid)],
)
console.log('ownership:', own.rows)

// Simulate appendAdminSyllabusMaterial
const full = await pool.query(
  'SELECT syllabus_pdf, subject_code, subject_name FROM subjects WHERE id = $1',
  [sid],
)
const syllabusRaw = String(full.rows[0]?.syllabus_pdf ?? '').trim()
console.log('syllabus present:', Boolean(syllabusRaw), 'len', syllabusRaw.length)

await pool.end()
