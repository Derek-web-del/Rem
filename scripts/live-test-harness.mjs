/**
 * Live test harness for OBJECTIVES verification (Tests 1,4,8,13,14,15-18 partial, PWA files).
 * Prerequisites: npm run dev (API :3001, Vite :5173), DATABASE_URL in .env
 *
 * Run: node --env-file=.env scripts/live-test-harness.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const API = process.env.SECURITY_EVIDENCE_API_BASE || `http://127.0.0.1:${process.env.AUTH_SERVER_PORT || 3001}`
const WEB = process.env.LIVE_TEST_WEB_BASE || 'http://localhost:5173'
const DATABASE_URL = process.env.DATABASE_URL

const results = []

function record(testNum, name, pass, notes = '') {
  results.push({ testNum, name, pass, notes })
  const icon = pass ? 'PASS' : 'FAIL'
  console.log(`[${icon}] Test ${testNum}: ${name}${notes ? ` — ${notes}` : ''}`)
}

function getSetCookie(res) {
  if (typeof res.headers.getSetCookie === 'function') return res.headers.getSetCookie()
  const v = res.headers.get('set-cookie')
  return v ? [v] : []
}

function cookieHeader(setCookies) {
  return setCookies.map((c) => String(c).split(';')[0]).filter(Boolean).join('; ')
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, opts)
  const text = await res.text()
  let json = null
  try { json = text ? JSON.parse(text) : null } catch { /* */ }
  return { res, json, text, setCookie: getSetCookie(res) }
}

async function signInAdmin() {
  const { res, json, setCookie } = await fetchJson(`${API}/api/auth/sign-in/username`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: process.env.SEED_ADMIN_PASSWORD || 'Admin123@' }),
  })
  if (!res.ok) return { ok: false, status: res.status, json }
  if (json?.twoFactorRedirect) {
    await fetchJson(`${API}/api/auth/two-factor/send-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader(setCookie) },
      body: '{}',
    })
    return { ok: false, needsOtp: true, cookies: cookieHeader(setCookie) }
  }
  return { ok: true, cookies: cookieHeader(setCookie) }
}

async function testHealthAndHeaders() {
  const { res } = await fetchJson(`${API}/health`)
  const csp = res.headers.get('content-security-policy')
  const xfo = res.headers.get('x-frame-options')
  const nosniff = res.headers.get('x-content-type-options')
  record(1, 'Browser Restrictions (Helmet headers)', !!(csp && xfo && nosniff),
    `CSP=${!!csp} X-Frame-Options=${xfo || 'missing'} nosniff=${!!nosniff}; HSTS prod-only`)
}

async function testRateLimit() {
  let got429 = false
  for (let i = 0; i < 12; i++) {
    const { res } = await fetchJson(`${API}/api/auth/sign-in/username`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'nope', password: 'wrong' }),
    })
    if (res.status === 429) { got429 = true; break }
  }
  record(1, 'Browser Restrictions (rate limit)', got429, got429 ? '429 on rapid sign-in' : 'no 429 in 12 attempts')
}

async function testEncryption() {
  if (!DATABASE_URL) {
    record(4, 'Encryption (DB)', false, 'DATABASE_URL missing')
    return
  }
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 })
  try {
    const students = await pool.query('SELECT first_name, last_name, contact_no, parent_contact FROM students LIMIT 3')
    const piiEncrypted = students.rows.every((r) =>
      ['first_name', 'last_name', 'contact_no', 'parent_contact'].every((k) => {
        const v = String(r[k] || '')
        return !v || v.startsWith('enc:v1:')
      }),
    )
    const accounts = await pool.query('SELECT password FROM account LIMIT 3')
    const bcryptOk = accounts.rows.length > 0 && accounts.rows.every((r) => String(r.password || '').startsWith('$2'))
    record(4, 'Encryption (PII + bcrypt)', piiEncrypted && bcryptOk,
      `PII enc:v1:${piiEncrypted} bcrypt:$2:${bcryptOk} rows=${students.rows.length}`)
  } finally {
    await pool.end()
  }
}

async function testCounts() {
  if (!DATABASE_URL) return
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 })
  try {
    const s = await pool.query('SELECT COUNT(*)::int AS c FROM students')
    const q = await pool.query('SELECT COUNT(*)::int AS c FROM quizzes')
    const qs = await pool.query('SELECT COUNT(*)::int AS c FROM quiz_submissions')
    const ok = s.rows[0].c > 0
    record(8, 'Centralized Storage (PostgreSQL counts)', ok,
      `students=${s.rows[0].c} quizzes=${q.rows[0].c} submissions=${qs.rows[0].c}`)
  } finally {
    await pool.end()
  }
}

async function testApiRbac() {
  const noCookie = await fetchJson(`${API}/api/v1/student/terms-status`)
  const anon401 = noCookie.res.status === 401
  const facultyTerms = await fetchJson(`${API}/api/v1/faculty/terms-status`)
  const termsNot403Admin = facultyTerms.res.status !== 403 || !String(facultyTerms.text).includes('Admin only')
  record(13, 'RBAC API (anonymous 401)', anon401, `status=${noCookie.res.status}`)
  record(13, 'RBAC API (terms-status not admin collision)', termsNot403Admin, `faculty terms=${facultyTerms.res.status}`)
}

async function testAesRoundTrip() {
  try {
    const { encrypt, decrypt, isAesConfigured } = await import('../server/lib/aes256.js')
    if (!isAesConfigured()) {
      record(14, 'AES-256 round-trip', false, 'AES_256_SECRET_KEY not configured')
      return
    }
    const plain = 'Hello PII'
    const enc = encrypt(plain)
    const dec = decrypt(enc)
    record(14, 'AES-256 round-trip', dec === plain && enc.startsWith('enc:v1:'),
      `encrypted prefix=${enc.slice(0, 12)} match=${dec === plain}`)
  } catch (e) {
    record(14, 'AES-256 round-trip', false, e.message)
  }
}

async function testPwaFiles() {
  const manifestPath = path.join(ROOT, 'public', 'manifest.json')
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
  const manifestOk = manifest.name === 'LenLearn LMS' && manifest.display === 'standalone' &&
    manifest.icons?.some((i) => i.sizes === '192x192') && manifest.icons?.some((i) => i.sizes === '512x512')
  record(15, 'PWA Manifest (file)', manifestOk, `name=${manifest.name} theme=${manifest.theme_color}`)

  const swExists = fs.existsSync(path.join(ROOT, 'public', 'sw.js'))
  const offlineExists = fs.existsSync(path.join(ROOT, 'public', 'offline.html'))
  record(16, 'Service Worker files', swExists && offlineExists, `sw.js=${swExists} offline.html=${offlineExists}`)

  const sw = fs.readFileSync(path.join(ROOT, 'public', 'sw.js'), 'utf8')
  const cacheOk = sw.includes("CACHE_VERSION = 'lenlearn-v2'") &&
    sw.includes('-static') && sw.includes('-dynamic') && sw.includes('-pdf')
  record(17, 'Cache API names in sw.js', cacheOk, 'lenlearn-v2-{static,dynamic,pdf}')

  const idb = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'lib', 'indexedDB.js'), 'utf8')
  const stores = [
    'quiz_progress', 'quiz_answers', 'sync_queue', 'cached_quizzes', 'student_profile',
    'announcements', 'subjects', 'study_materials', 'assignments', 'activities', 'grades',
    'teacher_sections', 'teacher_subjects', 'quiz_list', 'work_details', 'announcement_details',
    'subject_streams', 'quiz_details', 'quiz_results', 'admin_students', 'admin_faculties',
    'admin_subjects', 'admin_sections', 'faculty_work_details', 'faculty_grades_overview',
    'faculty_subject_streams',
  ]
  const idbOk = idb.includes("lenlearn_offline") && idb.includes('DB_VERSION = 3') &&
    stores.every((s) => idb.includes(`'${s}'`))
  record(18, 'IndexedDB schema (code)', idbOk, `DB=lenlearn_offline, ${stores.length} stores`)

  try {
    const mRes = await fetchJson(`${WEB}/manifest.json`)
    const oRes = await fetchJson(`${WEB}/offline.html`)
    const sRes = await fetchJson(`${WEB}/sw.js`)
    record(15, 'PWA Manifest (HTTP)', mRes.res.ok, `status=${mRes.res.status}`)
    record(16, 'offline.html (HTTP)', oRes.res.ok, `status=${oRes.res.status}`)
    record(16, 'sw.js (HTTP)', sRes.res.ok, `status=${sRes.res.status}`)
  } catch (e) {
    record(15, 'PWA HTTP fetch', false, `Vite not running: ${e.message}`)
  }
}

async function testErrorBoundary() {
  const main = fs.readFileSync(path.join(ROOT, 'Frontend', 'src', 'main.jsx'), 'utf8')
  const eb = fs.existsSync(path.join(ROOT, 'Frontend', 'src', 'components', 'ErrorBoundary.jsx'))
  const wrapped = main.includes('ErrorBoundary')
  record(28, 'ErrorBoundary exists and wraps App', eb && wrapped)
}

async function testMonitoringLogin() {
  const admin = await signInAdmin()
  if (!admin.ok) {
    record(3, 'Session Monitoring (admin login for API)', false, admin.needsOtp ? 'admin needs OTP — use browser' : `status=${admin.status}`)
    return
  }
  const { res, json } = await fetchJson(`${API}/api/monitoring/lms-activity?limit=5`, {
    headers: { Cookie: admin.cookies },
  })
  const hasActivity = res.ok && Array.isArray(json?.items || json?.data || json)
  record(3, 'Session Monitoring (LMS activity API)', res.ok, `status=${res.status} hasData=${hasActivity}`)
}

async function main() {
  console.log(`[live-test] API=${API} WEB=${WEB}`)
  await testHealthAndHeaders()
  await testEncryption()
  await testCounts()
  await testApiRbac()
  await testAesRoundTrip()
  await testPwaFiles()
  await testErrorBoundary()
  await testMonitoringLogin()

  const hammerRateLimit =
    String(process.env.LIVE_TEST_HAMMER_RATE_LIMIT || '').toLowerCase() === '1' ||
    String(process.env.LIVE_TEST_HAMMER_RATE_LIMIT || '').toLowerCase() === 'true'
  if (hammerRateLimit) {
    console.warn(
      '[live-test] LIVE_TEST_HAMMER_RATE_LIMIT=1 — hammering sign-in (exhausts bucket). Restart npm run dev before live:api.',
    )
    await testRateLimit()
  } else {
    console.log('[live-test] Skipping rate-limit hammer (set LIVE_TEST_HAMMER_RATE_LIMIT=1 to enable)')
  }

  const outPath = path.join(ROOT, 'docs', 'live-test-harness-results.json')
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2))
  console.log(`\n[live-test] Wrote ${path.relative(ROOT, outPath)}`)
  const passed = results.filter((r) => r.pass).length
  console.log(`[live-test] ${passed}/${results.length} checks passed`)
  process.exit(results.every((r) => r.pass) ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
