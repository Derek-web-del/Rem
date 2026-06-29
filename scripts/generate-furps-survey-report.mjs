/**
 * LenLearn FURPS Survey Results HTML Generator
 * Reads Google Forms CSV export and produces thesis-style HTML report.
 *
 * Usage: node scripts/generate-furps-survey-report.mjs [csvPath]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const DEFAULT_CSV = path.join(
  ROOT,
  'docs/thesis/data/LENLEARN_SYSTEM_FUNCTIONALITY_QUESTIONNAIRE.csv',
)
const OUTPUT_HTML = path.join(ROOT, 'docs/thesis/FURPS_Survey_Results.html')

const ROLE_COLUMN = 'What is your role in the school?'
const ROLE_MAP = {
  Student: 'Student',
  Teacher: 'Teacher',
  Administrator: 'Administrator',
}

const FURPS_LABELS = {
  F: 'Functionality',
  U: 'Usability',
  R: 'Reliability',
  P: 'Performance',
  S: 'Security',
}

const FURPS_DESCRIPTIONS = {
  F: 'Perceived completeness and accuracy of role-specific LMS modules.',
  U: 'Perceived clarity, navigation, and ease of use across portals.',
  R: 'Perceived consistency, stability, and dependability during use.',
  P: 'Perceived responsiveness and speed during evaluation tasks.',
  S: 'Perceived effectiveness of authentication, access controls, and data privacy.',
}

/** Question text → FURPS category, per role (order preserved within each category). */
const QUESTION_MAP = {
  Student: {
    F: [
      'I can log in and see my enrolled subjects.',
      'I can access my study materials when I need them.',
      'I can submit my assignments and activities as PDF files.',
      'I can take timed quizzes and enter a password when my teacher requires one.',
      'I can see announcements and my grades on the dashboard.',
    ],
    U: [
      'The student dashboard is easy to navigate.',
      'I can easily find my subjects, assignments, and activities.',
      'Submitting PDF files for assignments and activities is easy.',
      'The quiz screen is clear and easy to understand.',
      'Overall, the student portal is easy to use.',
    ],
    R: [
      'My uploaded PDF files are saved after I submit them.',
      'Quizzes do not crash or stop unexpectedly during a test.',
      'Grades on my dashboard match what my teachers recorded.',
      'The system was accessible every time I tried to log in.',
      'My name, section, and other details shown in the system are correct.',
    ],
    P: [
      'Pages in the student portal load within a reasonable time.',
      'My PDF uploads finish within a reasonable time.',
      'Quizzes load and let me submit answers without long delays.',
      'The system feels fast when I use it every day.',
      'The system feels fast regardless of the time of day I use it.',
    ],
    S: [
      'The system stops me from logging in after entering the wrong password too many times.',
      'The system logs me out when I have been inactive for a while.',
      "I cannot view other students' work or personal information.",
      'I cannot access or change my classmates’ submitted files.',
      'I feel that my personal information is safe in the system.',
    ],
  },
  Teacher: {
    F: [
      'After I log in, I can see and use the teacher tools I need.',
      'I can create, edit, and manage assignments and activities.',
      'The AI plagiarism checker works well for my needs.',
      'I can upload and organize study materials for my classes.',
      'I can view student submissions and enter grades accurately.',
    ],
    U: [
      'The teacher dashboard is easy to navigate.',
      'The plagiarism checker is straightforward to use.',
      'Uploading study materials is simple and intuitive.',
      'The quiz maker is clear and easy to follow.',
      'Overall, the teacher portal feels intuitive to use.',
    ],
    R: [
      'The system stays stable during my daily teaching work.',
      'Student submission files are saved and displayed correctly.',
      'The system keeps a record when I grade student work.',
      'Grade records stay accurate throughout the term.',
    ],
    P: [
      'Student submission lists load within a reasonable time.',
      'Plagiarism checker results are displayed within a reasonable time after submission.',
      'Study materials and uploaded files load within a reasonable time.',
      'Grade updates appear on the system right after I submit them.',
      'The teacher portal feels fast during daily use.',
    ],
    S: [
      'I can see only my own classes and assigned students.',
      'The email login code makes my account harder for others to access.',
      'The system logs me out when I have been inactive for a while.',
      "Only I can view my students' submitted work.",
      'Only I can view the plagiarism reports I created.',
    ],
  },
  Administrator: {
    F: [
      'I can add, edit, and archive student and faculty records.',
      'The system restricts access so that each user type can only see the tools assigned to their role, as visible through the admin panel.',
      'I can manage curriculum, subjects, and sections as needed.',
      'I can post and manage school announcements.',
      'Backup, restore, and archive vault features work as expected.',
    ],
    U: [
      'The admin dashboard is easy to navigate.',
      'Managing user accounts is simple and straightforward.',
      'The activity logs and monitoring screens are easy to read.',
      'New administrators can learn the system with little training.',
    ],
    R: [
      'The system stays stable during my daily admin work.',
      'Activity logs match what actually happened in the system.',
      'Data is not lost after backup and restore operations.',
      'User permissions work the same way across all admin modules.',
    ],
    P: [
      'The system does not slow down during busy enrollment periods.',
      'The admin dashboard opens within a reasonable time.',
      'User management screens respond quickly when I search or edit.',
      'The system handles large numbers of student and faculty records well.',
      'The system works well even during everyday use.',
      'Activity logs load and filter within a reasonable time.',
    ],
    S: [
      'Only authorized administrators can access administrator functions.',
      'The email login code makes admin sign-in feel secure.',
      'Sensitive school records are hidden from unauthorized users (such as Faculty members and students).',
      'Private student information (name, contact details) is not visible to the public.',
      'The system logs me out automatically after a period of inactivity.',
    ],
  },
}

function normalizeHeader(text) {
  return String(text || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/['']/g, "'")
}

function parseCsv(text) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const next = text[i + 1]

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"'
        i++
      } else if (ch === '"') {
        inQuotes = false
      } else {
        field += ch
      }
      continue
    }

    if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field)
      field = ''
    } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      if (ch === '\r') i++
    } else if (ch !== '\r') {
      field += ch
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  return rows
}

function buildRoleRanges(headers) {
  const norm = headers.map(normalizeHeader)
  const findAll = (label) => {
    const key = normalizeHeader(label)
    const hits = []
    norm.forEach((h, i) => {
      if (h === key) hits.push(i)
    })
    return hits
  }

  const gradeLevelIdx = norm.findIndex((h) => h === 'Grade Level')
  const currentRoleHits = findAll('Current Role:')
  const yearsHits = findAll('Years of Relevant Experience')

  if (gradeLevelIdx < 0 || currentRoleHits.length < 2 || yearsHits.length < 2) {
    throw new Error('Could not locate Student / Teacher / Administrator column sections in CSV header')
  }

  return {
    Student: { start: gradeLevelIdx + 1, end: currentRoleHits[0] },
    Teacher: { start: yearsHits[0] + 1, end: currentRoleHits[1] },
    Administrator: { start: yearsHits[1] + 1, end: headers.length },
  }
}

function buildRoleColumnMaps(headers, ranges) {
  const roleColMaps = {}
  for (const [role, range] of Object.entries(ranges)) {
    roleColMaps[role] = { range, _headers: headers }
  }
  return roleColMaps
}

function resolveColumn(roleColMaps, role, questionText, occurrence = 0) {
  const key = normalizeHeader(questionText)
  const { range, _headers: headers } = roleColMaps[role]

  let matchCount = 0
  for (let i = range.start; i < range.end; i++) {
    const h = normalizeHeader(headers[i])
    if (h === key || h.includes(key.slice(0, 40)) || key.includes(h.slice(0, 40))) {
      if (matchCount === occurrence) return i
      matchCount++
    }
  }
  return undefined
}

function parseLikert(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).trim())
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return n
}

export function interpretWM(score) {
  if (score == null || Number.isNaN(score)) return '—'
  if (score >= 4.21) return 'Strongly Agree'
  if (score >= 3.41) return 'Agree'
  if (score >= 2.61) return 'Neutral'
  if (score >= 1.81) return 'Disagree'
  return 'Strongly Disagree'
}

export function computeQuestionStats(values) {
  const freq = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0
  let count = 0

  for (const v of values) {
    const n = parseLikert(v)
    if (n == null) continue
    freq[n]++
    sum += n
    count++
  }

  const wm = count > 0 ? sum / count : null
  return { freq, count, sum, wm, interpretation: interpretWM(wm) }
}

export function computeAreaOverall(allValues) {
  const stats = computeQuestionStats(allValues)
  return stats.wm
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmt(n) {
  if (n == null || Number.isNaN(n)) return '—'
  return n.toFixed(2)
}

export function loadAndAnalyze(csvPath) {
  const raw = fs.readFileSync(csvPath, 'utf8')
  const rows = parseCsv(raw)
  const headers = rows[0]
  const roleRanges = buildRoleRanges(headers)
  const roleColMaps = buildRoleColumnMaps(headers, roleRanges)

  const roleColIdx = headers.findIndex((h) => normalizeHeader(h) === normalizeHeader(ROLE_COLUMN))
  if (roleColIdx < 0) {
    throw new Error(`Role column not found: "${ROLE_COLUMN}"`)
  }

  const dataRows = rows.slice(1).filter((r) => r.some((c) => String(c).trim() !== ''))

  const byRole = { Student: [], Teacher: [], Administrator: [] }
  for (const row of dataRows) {
    const roleRaw = normalizeHeader(row[roleColIdx])
    const role = ROLE_MAP[roleRaw]
    if (role) byRole[role].push(row)
  }

  const columnKeys = {}
  for (const role of Object.keys(QUESTION_MAP)) {
    columnKeys[role] = {}
    for (const [furps, questions] of Object.entries(QUESTION_MAP[role])) {
      const occTracker = new Map()
      columnKeys[role][furps] = questions.map((q) => {
        const key = normalizeHeader(q)
        const occurrence = occTracker.get(key) || 0
        occTracker.set(key, occurrence + 1)
        const idx = resolveColumn(roleColMaps, role, q, occurrence)
        if (idx == null) throw new Error(`Column not found for ${role} / ${furps}: ${q}`)
        return { text: q, index: idx }
      })
    }
  }

  const results = {}
  for (const role of Object.keys(QUESTION_MAP)) {
    results[role] = {}
    for (const furps of Object.keys(FURPS_LABELS)) {
      const items = columnKeys[role][furps].map(({ text, index }) => {
        const values = byRole[role].map((row) => row[index])
        const stats = computeQuestionStats(values)
        return { text, ...stats }
      })

      const pooledValues = byRole[role].flatMap((row) =>
        columnKeys[role][furps].map(({ index }) => row[index]),
      )
      const overall = computeAreaOverall(pooledValues)

      results[role][furps] = {
        items,
        overall,
        overallInterpretation: interpretWM(overall),
        respondentCount: byRole[role].length,
      }
    }
  }

  return {
    byRole,
    results,
    columnKeys,
    roleColIdx,
    dataRows,
    totalResponses: dataRows.length,
    generatedAt: new Date().toISOString(),
  }
}

export {
  QUESTION_MAP,
  FURPS_LABELS,
  ROLE_MAP,
  ROLE_COLUMN,
  DEFAULT_CSV,
}

function renderRoleTable(role, furps, data) {
  const { items, overall, overallInterpretation, respondentCount } = data
  const furpsName = FURPS_LABELS[furps]

  let rows = items
    .map(
      (item) => `
    <tr>
      <td class="left">${escapeHtml(item.text)}</td>
      <td>${item.freq[1]}</td>
      <td>${item.freq[2]}</td>
      <td>${item.freq[3]}</td>
      <td>${item.freq[4]}</td>
      <td>${item.freq[5]}</td>
      <td>${item.count}</td>
      <td>${fmt(item.wm)}</td>
      <td>${item.interpretation}</td>
    </tr>`,
    )
    .join('')

  rows += `
    <tr class="overall-row">
      <td class="left bold" colspan="7">Overall ${furpsName} — ${role} (<em>n</em> = ${respondentCount})</td>
      <td class="bold">${fmt(overall)}</td>
      <td class="bold">${overallInterpretation}</td>
    </tr>`

  return `
<h4>${role} (<em>n</em> = ${respondentCount})</h4>
<div class="table-title">Table 4.${furps === 'F' ? '2' : furps === 'U' ? '3' : furps === 'R' ? '4' : furps === 'P' ? '5' : '6'}-${role === 'Student' ? 'a' : role === 'Teacher' ? 'b' : 'c'}. ${furpsName} — ${role} Responses</div>
<table>
  <thead>
    <tr>
      <th class="left">Question</th>
      <th>1</th>
      <th>2</th>
      <th>3</th>
      <th>4</th>
      <th>5</th>
      <th><em>n</em></th>
      <th>Weighted Mean</th>
      <th>Interpretation</th>
    </tr>
  </thead>
  <tbody>${rows}</tbody>
</table>`
}

function renderHtml(analysis) {
  const { results, byRole, totalResponses, generatedAt } = analysis
  const nStudent = byRole.Student.length
  const nTeacher = byRole.Teacher.length
  const nAdmin = byRole.Administrator.length

  const summaryRows = Object.keys(FURPS_LABELS)
    .map((furps) => {
      const label = FURPS_LABELS[furps]
      const s = results.Student[furps]
      const t = results.Teacher[furps]
      const a = results.Administrator[furps]
      return `<tr>
      <td class="left bold">${furps} — ${label}</td>
      <td>${fmt(s.overall)}</td>
      <td>${s.overallInterpretation}</td>
      <td>${fmt(t.overall)}</td>
      <td>${t.overallInterpretation}</td>
      <td>${fmt(a.overall)}</td>
      <td>${a.overallInterpretation}</td>
    </tr>`
    })
    .join('')

  const furpsSections = Object.keys(FURPS_LABELS)
    .map((furps) => {
      const sectionNum = { F: '4.2.1', U: '4.2.2', R: '4.2.3', P: '4.2.4', S: '4.2.5' }[furps]
      return `
<h3>${sectionNum} ${FURPS_LABELS[furps]}</h3>
<p>${FURPS_DESCRIPTIONS[furps]}</p>
${renderRoleTable('Student', furps, results.Student[furps])}
${renderRoleTable('Teacher', furps, results.Teacher[furps])}
${renderRoleTable('Administrator', furps, results.Administrator[furps])}`
    })
    .join('\n')

  const genDate = generatedAt.slice(0, 10)

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Section 4.2 — FURPS Survey Results | LenLearn Capstone Thesis</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Times New Roman',Times,serif;font-size:12pt;color:#000;background:#fff;line-height:2;max-width:960px;margin:0 auto;padding:48px 64px}
h1{font-size:12pt;font-weight:bold;text-align:center;margin-bottom:24px;line-height:1.6}
h2{font-size:12pt;font-weight:bold;margin:28px 0 12px}
h3{font-size:12pt;font-weight:bold;margin:24px 0 10px}
h4{font-size:12pt;font-weight:bold;margin:18px 0 8px;font-style:italic}
p{margin-bottom:12px;text-align:justify;text-indent:48px}
p.no-indent{text-indent:0}
.bold{font-weight:bold}
table{width:100%;border-collapse:collapse;margin:12px 0 20px;font-size:10pt}
th{background:#f0f0f0;padding:6px 8px;text-align:center;border:1px solid #000;font-weight:bold;font-size:10pt}
td{padding:6px 8px;border:1px solid #000;vertical-align:top;line-height:1.45;text-align:center;font-size:10pt}
td.left{text-align:left}
tr.overall-row td{background:#f7f7f7}
.table-title{text-align:center;font-weight:bold;margin:14px 0 6px;font-size:11pt}
.table-note{font-size:10pt;font-style:italic;margin:4px 0 14px;text-indent:0;line-height:1.6}
.meta{font-size:10pt;color:#333;text-indent:0;margin-bottom:20px;text-align:center}
@media print{body{padding:48px 64px}table{page-break-inside:auto}tr{page-break-inside:avoid}}
</style>
</head>
<body>

<h1>SECTION 4.2<br>RESULTS OF SYSTEM QUALITY EVALUATION BASED ON FURPS</h1>
<p class="meta no-indent">Generated from Post-Test Evaluation Questionnaire data · ${genDate}</p>

<p>System quality was evaluated using the Post-Test Evaluation Questionnaire described in Section 3.8.3. A total of ${totalResponses} participants completed the survey after guided walkthroughs: ${nStudent} students, ${nTeacher} teachers, and ${nAdmin} administrator. Responses were analyzed using frequency distribution and weighted mean as defined in Section 3.7.3 and interpreted through the ordinal ranges in Table 3.8. These results reflect perceived system quality during controlled evaluation and do not by themselves prove absolute compliance or complete satisfaction.</p>

<div class="table-title">Table 4.2. Summary of Overall FURPS Weighted Mean Scores by Role</div>
<table>
  <thead>
    <tr>
      <th class="left">FURPS Quality Area</th>
      <th colspan="2">Student (<em>n</em> = ${nStudent})</th>
      <th colspan="2">Teacher (<em>n</em> = ${nTeacher})</th>
      <th colspan="2">Administrator (<em>n</em> = ${nAdmin})</th>
    </tr>
    <tr>
      <th class="left"></th>
      <th>WM</th><th>Interpretation</th>
      <th>WM</th><th>Interpretation</th>
      <th>WM</th><th>Interpretation</th>
    </tr>
  </thead>
  <tbody>${summaryRows}</tbody>
</table>
<p class="table-note no-indent">Note. WM = weighted mean computed as pooled mean across all item responses within each FURPS area and role (Σfx / Σf). Scale: 1 = Strongly Disagree, 5 = Strongly Agree.</p>

${furpsSections}

<h3>Likert Scale Interpretation Reference</h3>
<div class="table-title">Table 3.8. Likert Scale and Weighted Mean Interpretation for Survey Responses</div>
<table>
  <thead>
    <tr><th>Scale Value</th><th>Verbal Interpretation</th><th>Weighted Mean Range</th></tr>
  </thead>
  <tbody>
    <tr><td>5</td><td>Strongly Agree</td><td>4.21 – 5.00</td></tr>
    <tr><td>4</td><td>Agree</td><td>3.41 – 4.20</td></tr>
    <tr><td>3</td><td>Neutral</td><td>2.61 – 3.40</td></tr>
    <tr><td>2</td><td>Disagree</td><td>1.81 – 2.60</td></tr>
    <tr><td>1</td><td>Strongly Disagree</td><td>1.00 – 1.80</td></tr>
  </tbody>
</table>

<p class="table-note no-indent">Data source: <em>LENLEARN SYSTEM FUNCTIONALITY QUESTIONNAIRE.csv</em> (Google Forms export). Administrator performance items include one instance of the duplicate column &ldquo;Activity logs load and filter within a reasonable time.&rdquo; Results for the administrator role reflect a single respondent (<em>n</em> = 1) and should be interpreted with caution.</p>

</body>
</html>`
}

function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const analysis = loadAndAnalyze(csvPath)
  const html = renderHtml(analysis)

  fs.mkdirSync(path.dirname(OUTPUT_HTML), { recursive: true })
  fs.writeFileSync(OUTPUT_HTML, html, 'utf8')

  console.log('FURPS Survey Report generated.')
  console.log(`  CSV:    ${csvPath}`)
  console.log(`  Output: ${OUTPUT_HTML}`)
  console.log(`  Total:  ${analysis.totalResponses} responses`)
  console.log(`  Student: ${analysis.byRole.Student.length}, Teacher: ${analysis.byRole.Teacher.length}, Administrator: ${analysis.byRole.Administrator.length}`)
  console.log('\nOverall FURPS (pooled WM):')
  for (const furps of Object.keys(FURPS_LABELS)) {
    const s = analysis.results.Student[furps]
    const t = analysis.results.Teacher[furps]
    const a = analysis.results.Administrator[furps]
    console.log(
      `  ${furps}: Student ${fmt(s.overall)} | Teacher ${fmt(t.overall)} | Admin ${fmt(a.overall)}`,
    )
  }
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isDirectRun) main()
