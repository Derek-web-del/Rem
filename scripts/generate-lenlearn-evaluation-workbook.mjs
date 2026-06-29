/**
 * LenLearn FURPS + STRIDE Evaluation Workbook Generator
 * Uses BSIT template layout as reference; evaluation model is FURPS (not ISO).
 *
 * Usage: node scripts/generate-lenlearn-evaluation-workbook.mjs [csvPath]
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import XLSX from 'xlsx'
import {
  loadAndAnalyze,
  interpretWM,
  QUESTION_MAP,
  FURPS_LABELS,
  ROLE_MAP,
  DEFAULT_CSV,
} from './generate-furps-survey-report.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

const OUTPUT_XLSX = path.join(ROOT, 'docs/thesis/LenLearn_Evaluation_Workbook_FURPS_STRIDE.xlsx')

const FURPS_ORDER = ['F', 'U', 'R', 'P', 'S']

const STRIDE_FOR_SECURITY = {
  Student: ['Spoofing', 'Spoofing', 'Elevation of Privilege', 'Tampering', 'Information Disclosure'],
  Teacher: ['Elevation of Privilege', 'Spoofing', 'Spoofing', 'Elevation of Privilege', 'Elevation of Privilege'],
  Administrator: [
    'Elevation of Privilege',
    'Spoofing',
    'Information Disclosure',
    'Information Disclosure',
    'Spoofing',
  ],
}

const STRIDE_CATEGORIES = [
  'Spoofing',
  'Tampering',
  'Repudiation',
  'Information Disclosure',
  'Denial of Service',
  'Elevation of Privilege',
]

function parseLikert(value) {
  if (value == null || value === '') return null
  const n = Number(String(value).trim())
  if (!Number.isFinite(n) || n < 1 || n > 5) return null
  return n
}

/** Build flat item catalog: { id, role, furps, text, colIndex } */
function buildItemCatalog(columnKeys) {
  const items = []
  let n = 1
  for (const role of Object.keys(QUESTION_MAP)) {
    for (const furps of FURPS_ORDER) {
      for (const { text, index } of columnKeys[role][furps]) {
        const roleCode = role === 'Student' ? 'STU' : role === 'Teacher' ? 'TCH' : 'ADM'
        items.push({
          id: `LL-${String(n).padStart(3, '0')}`,
          roleCode,
          role,
          furps,
          furpsLabel: FURPS_LABELS[furps],
          text,
          index,
        })
        n++
      }
    }
  }
  return items
}

function sheetFromRows(rows) {
  return XLSX.utils.aoa_to_sheet(rows)
}

function buildReadmeSheet() {
  return sheetFromRows([
    ['LenLearn Evaluation Workbook — FURPS & STRIDE'],
    [],
    ['Purpose'],
    [
      'System quality evaluation of LenLearn using the FURPS model (Functionality, Usability, Reliability, Performance, Security) and security testing documentation aligned with STRIDE threat categories. Layout follows the BSIT Cybersecurity Evaluation workbook structure.',
    ],
    [],
    ['Workbook Section', 'Use'],
    ['Settings & Scale', 'Project information and 5-point Likert interpretation.'],
    ['FURPS Items', 'Questionnaire statements grouped by FURPS area and evaluator role.'],
    ['FURPS Responses', 'Encoded survey ratings (1–5) from Google Forms export.'],
    ['FURPS Summary', 'Weighted means and interpretation per FURPS area and role.'],
    ['FURPS Detail', 'Frequency distribution and weighted mean per question.'],
    ['Security Items', 'LenLearn security-related questionnaire statements with STRIDE mapping.'],
    ['Security Responses', 'Security item ratings from the survey (FURPS Security area).'],
    ['Security Summary', 'Weighted means per STRIDE category from security responses.'],
    ['STRIDE Test Cases', 'Controlled security test execution log for LenLearn.'],
    ['Test Coverage', 'STRIDE category coverage checklist.'],
    ['References', 'Standards and evaluation basis.'],
  ])
}

function buildSettingsSheet() {
  return sheetFromRows([
    ['Project Setup and Scoring Guide'],
    [],
    ['Editable Field', 'Value'],
    ['Project Title', 'LenLearn: A Secure LMS with Monitoring Records and AI-Powered Plagiarism Checker'],
    ['Client', 'Glendale School'],
    ['Course/Program', 'BSIT Specialization in Cybersecurity'],
    ['Researchers/Group', 'Group OLYMPUS — FEU Institute of Technology'],
    ['Academic Term', 'Capstone 1 — A.Y. 2025–2026'],
    ['Selected Scale', '5-Point Likert Scale'],
    [],
    ['Likert Scale Interpretation'],
    ['Score', 'Response', 'Weighted Mean Range', 'Interpretation'],
    [5, 'Strongly Agree', '4.21 – 5.00', 'Strongly Agree'],
    [4, 'Agree', '3.41 – 4.20', 'Agree'],
    [3, 'Neutral', '2.61 – 3.40', 'Neutral'],
    [2, 'Disagree', '1.81 – 2.60', 'Disagree'],
    [1, 'Strongly Disagree', '1.00 – 1.80', 'Strongly Disagree'],
  ])
}

function buildFurpsItemsSheet(catalog) {
  const rows = [
    ['Instrument A: System Evaluation — FURPS Questionnaire Items'],
    [],
    ['Item ID', 'FURPS Area', 'FURPS Code', 'Evaluator Role', 'Evaluation Statement', 'Scale'],
  ]
  for (const item of catalog) {
    rows.push([item.id, item.furpsLabel, item.furps, item.role, item.text, '5-Point Likert'])
  }
  return sheetFromRows(rows)
}

function buildFurpsResponsesSheet(analysis, catalog) {
  const header = [
    'Respondent ID',
    'Evaluator Role',
    'System / Project',
    'Date Evaluated',
    'Remarks',
    ...catalog.map((i) => i.id),
    'Total Score',
    'Mean Score',
    'Interpretation',
    'Completion',
  ]
  const rows = [
    ['Instrument A Response Entry — FURPS Ratings from LenLearn Survey'],
    [],
    [],
    header,
  ]

  const { dataRows, roleColIdx } = analysis

  dataRows.forEach((row, idx) => {
    const roleRaw = String(row[roleColIdx] || '').trim()
    const role = ROLE_MAP[roleRaw]
    if (!role) return

    const scores = catalog.map((item) => {
      if (item.role !== role) return ''
      const v = parseLikert(row[item.index])
      return v != null ? v : ''
    })

    const answered = scores.filter((v) => v !== '')
    const total = answered.length ? answered.reduce((a, b) => a + b, 0) : ''
    const mean = answered.length ? total / answered.length : ''
    const expected = catalog.filter((i) => i.role === role).length

    rows.push([
      `R-${String(idx + 1).padStart(3, '0')}`,
      role,
      'LenLearn LMS — Glendale School',
      String(row[0] || '').slice(0, 10),
      '',
      ...scores,
      total !== '' ? total : '',
      mean !== '' ? Number(mean.toFixed(2)) : '',
      mean !== '' ? interpretWM(mean) : 'Incomplete',
      answered.length === expected ? 'Complete' : answered.length ? 'Partial' : 'Not Started',
    ])
  })

  return sheetFromRows(rows)
}

function buildFurpsSummarySheet(analysis) {
  const rows = [
    ['Instrument A Summary Dashboard — FURPS Evaluation'],
    [],
    ['FURPS Area', 'Code', 'Items', 'Student WM', 'Student Interpretation', 'Teacher WM', 'Teacher Interpretation', 'Administrator WM', 'Administrator Interpretation', 'Overall WM', 'Overall Interpretation'],
  ]

  let grandSum = 0
  let grandCount = 0

  for (const furps of FURPS_ORDER) {
    const st = analysis.results.Student[furps]
    const te = analysis.results.Teacher[furps]
    const ad = analysis.results.Administrator[furps]
    const itemCount = QUESTION_MAP.Student[furps].length

    let sum = 0
    let count = 0
    for (const role of ['Student', 'Teacher', 'Administrator']) {
      for (const item of analysis.results[role][furps].items) {
        sum += item.sum
        count += item.count
      }
    }
    const overall = count ? sum / count : null
    if (count) {
      grandSum += sum
      grandCount += count
    }

    rows.push([
      FURPS_LABELS[furps],
      furps,
      itemCount,
      st.overall != null ? Number(st.overall.toFixed(2)) : '',
      st.overallInterpretation,
      te.overall != null ? Number(te.overall.toFixed(2)) : '',
      te.overallInterpretation,
      ad.overall != null ? Number(ad.overall.toFixed(2)) : '',
      ad.overallInterpretation,
      overall != null ? Number(overall.toFixed(2)) : '',
      overall != null ? interpretWM(overall) : 'No Data',
    ])
  }

  const grandWm = grandCount ? grandSum / grandCount : null
  rows.push([])
  rows.push([
    'Overall System Evaluation (FURPS)',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    '',
    grandWm != null ? Number(grandWm.toFixed(2)) : '',
    grandWm != null ? interpretWM(grandWm) : 'No Data',
  ])

  return sheetFromRows(rows)
}

function buildFurpsDetailSheet(analysis) {
  const rows = [
    ['FURPS Detailed Results — Frequency and Weighted Mean per Question'],
    [],
    ['FURPS Area', 'Code', 'Role', 'Question', '1', '2', '3', '4', '5', 'n', 'Weighted Mean', 'Interpretation'],
  ]

  for (const furps of FURPS_ORDER) {
    for (const role of Object.keys(QUESTION_MAP)) {
      for (const item of analysis.results[role][furps].items) {
        rows.push([
          FURPS_LABELS[furps],
          furps,
          role,
          item.text,
          item.freq[1],
          item.freq[2],
          item.freq[3],
          item.freq[4],
          item.freq[5],
          item.count,
          item.wm != null ? Number(item.wm.toFixed(2)) : '',
          item.interpretation,
        ])
      }
    }
  }
  return sheetFromRows(rows)
}

function buildSecurityItemsSheet(catalog) {
  const rows = [
    ['Instrument B: Security Evaluation — LenLearn Questionnaire Items (FURPS Security)'],
    [],
    ['Item ID', 'STRIDE Category', 'Evaluator Role', 'Evaluation Statement', 'Scale'],
  ]
  let secN = 1
  for (const item of catalog) {
    if (item.furps !== 'S') continue
    const strideIdx = QUESTION_MAP[item.role].S.indexOf(item.text)
    const stride = STRIDE_FOR_SECURITY[item.role][strideIdx] || ''
    rows.push([`SEC-${String(secN).padStart(2, '0')}`, stride, item.role, item.text, '5-Point Likert'])
    secN++
  }
  return sheetFromRows(rows)
}

function buildSecurityResponsesSheet(analysis, catalog) {
  const secItems = catalog.filter((i) => i.furps === 'S')
  const header = [
    'Respondent ID',
    'Evaluator Role',
    'System / Project',
    'Date Evaluated',
    'Remarks',
    ...secItems.map((_, i) => `SEC-${String(i + 1).padStart(2, '0')}`),
    'Total Score',
    'Mean Score',
    'Interpretation',
    'Completion',
  ]
  const rows = [
    ['Instrument B Response Entry — Security (FURPS S) Ratings'],
    [],
    [],
    header,
  ]

  const { dataRows, roleColIdx } = analysis

  dataRows.forEach((row, idx) => {
    const roleRaw = String(row[roleColIdx] || '').trim()
    const role = ROLE_MAP[roleRaw]
    if (!role) return

    const scores = secItems.map((item) => {
      if (item.role !== role) return ''
      const v = parseLikert(row[item.index])
      return v != null ? v : ''
    })

    const answered = scores.filter((v) => v !== '')
    const total = answered.length ? answered.reduce((a, b) => a + b, 0) : ''
    const mean = answered.length ? total / answered.length : ''
    const expected = secItems.filter((i) => i.role === role).length

    rows.push([
      `S-${String(idx + 1).padStart(3, '0')}`,
      role,
      'LenLearn LMS — Glendale School',
      String(row[0] || '').slice(0, 10),
      '',
      ...scores,
      total !== '' ? total : '',
      mean !== '' ? Number(mean.toFixed(2)) : '',
      mean !== '' ? interpretWM(mean) : 'Incomplete',
      answered.length === expected ? 'Complete' : answered.length ? 'Partial' : 'Not Started',
    ])
  })

  return sheetFromRows(rows)
}

function buildSecuritySummarySheet(analysis) {
  const rows = [
    ['Instrument B Summary Dashboard — STRIDE (from FURPS Security Survey)'],
    [],
    ['STRIDE Category', 'Security Focus', 'Ratings Entered', 'Weighted Mean', 'Interpretation'],
  ]

  const focus = {
    Spoofing: 'Identity/authentication controls',
    Tampering: 'Integrity/injection controls',
    Repudiation: 'Audit logging/accountability',
    'Information Disclosure': 'Confidentiality/data exposure',
    'Denial of Service': 'Availability/resource abuse',
    'Elevation of Privilege': 'Authorization/access control',
  }

  let grandSum = 0
  let grandCount = 0

  for (const stride of STRIDE_CATEGORIES) {
    let sum = 0
    let count = 0
    for (const role of Object.keys(QUESTION_MAP)) {
      QUESTION_MAP[role].S.forEach((qText, qi) => {
        if (STRIDE_FOR_SECURITY[role][qi] !== stride) return
        const item = analysis.results[role].S.items[qi]
        sum += item.sum
        count += item.count
      })
    }
    const wm = count ? sum / count : null
    if (count) {
      grandSum += sum
      grandCount += count
    }
    rows.push([
      stride,
      focus[stride],
      count,
      wm != null ? Number(wm.toFixed(2)) : '',
      wm != null ? interpretWM(wm) : 'No Data',
    ])
  }

  const grandWm = grandCount ? grandSum / grandCount : null
  rows.push([])
  rows.push([
    'Overall Security Evaluation (Survey)',
    '',
    grandCount,
    grandWm != null ? Number(grandWm.toFixed(2)) : '',
    grandWm != null ? interpretWM(grandWm) : 'No Data',
  ])

  return sheetFromRows(rows)
}

function buildStrideTestCasesSheet() {
  return sheetFromRows([
    ['Instrument C: Security Test Case Scenarios — STRIDE Coverage Log'],
    [],
    ['Test Case ID', 'STRIDE Category', 'Scenario', 'Attack / Vulnerability', 'Objective', 'Preconditions / Test Data', 'Controlled Test Steps', 'Expected Secure Result', 'Actual Result', 'Status', 'Severity', 'Evidence Reference', 'Remarks'],
    ['TC-01', 'Spoofing', 'Authentication/session impersonation attempt', 'Invalid credentials or manipulated session token', 'Verify login controls', 'Valid user account in test environment', 'Attempt access using invalid login and expired session token.', 'Access denied; no authenticated session established.', 'Generic 401 on invalid login; lockout after 5 failures; rate limit 429 observed.', 'Passed', 'High', 'docs/SECURITY_TEST_CASES.md AUTH-001', ''],
    ['TC-02', 'Tampering', 'SQL Injection on login/search/input field', 'SQL Injection', 'Verify injection prevention', 'Local dev environment', 'Enter SQL injection payloads in input points.', 'Payload rejected safely; no SQL error leakage.', '5/5 SQL injection pen-test cases passed; parameterized queries.', 'Passed', 'Critical', 'docs/LenLearn_SQL_Injection_PenTest_Report.html', ''],
    ['TC-03', 'Tampering', 'Unauthorized request modification', 'Parameter/record manipulation', 'Verify integrity controls', 'Authenticated faculty session', 'Modify critical request parameters before submission.', 'Unauthorized modification rejected.', 'Grade audit records old/new values; RBAC on API routes.', 'Passed', 'High', 'docs/SECURITY_TEST_CASES.md LOG-002', ''],
    ['TC-04', 'Repudiation', 'Audit trail verification for login events', 'Log omission', 'Verify accountability', 'Audit logging enabled', 'Perform failed and successful login attempts; inspect audit logs.', 'Logs capture date/time, actor, and outcome.', 'Login, lockout, and unauthorized events recorded in audit_logs.', 'Passed', 'Medium', 'docs/evidence/automated/', ''],
    ['TC-05', 'Information Disclosure', 'Cross-Site Scripting check', 'XSS', 'Verify output encoding', 'Controlled XSS test string', 'Submit harmless XSS string in text fields.', 'Script does not execute; output sanitized.', 'XSS payload stored as plain text; DOMPurify on frontend.', 'Passed', 'High', 'docs/SECURITY_TEST_CASES.md INPUT-003', ''],
    ['TC-06', 'Denial of Service', 'Excessive requests or oversized upload', 'Resource exhaustion', 'Verify rate/size limits', 'Controlled test within approved limits', 'Send repeated requests or oversized upload.', 'Requests/files limited without service failure.', 'Rate limits and upload size caps enforced; body limit 10mb.', 'Partially Verified', 'High', 'docs/SECURITY_TEST_CASES.md', ''],
    ['TC-07', 'Elevation of Privilege', 'Unauthorized role/function access', 'Broken access control', 'Verify RBAC', 'Student, faculty, admin test accounts', 'Using lower-privilege account, attempt admin/teacher routes and API.', 'Access denied with 401/403.', 'Route guards and API RBAC verified; ACCESS-001/002 passed.', 'Passed', 'Critical', 'docs/evidence/automated/RBAC_Evidence.txt', ''],
  ])
}

function buildTestCoverageSheet() {
  return sheetFromRows([
    ['Instrument C Dashboard — STRIDE Test Coverage and Outcomes'],
    [],
    ['STRIDE Category', 'Required Minimum Cases', 'Designed Cases', 'Executed Cases', 'Passed', 'Failed / Partial', 'Coverage Status'],
    ['Spoofing', 1, 1, 1, 1, 0, 'Covered'],
    ['Tampering', 1, 2, 2, 2, 0, 'Covered'],
    ['Repudiation', 1, 1, 1, 1, 0, 'Covered'],
    ['Information Disclosure', 1, 1, 1, 1, 0, 'Covered'],
    ['Denial of Service', 1, 1, 1, 0, 1, 'Covered'],
    ['Elevation of Privilege', 1, 1, 1, 1, 0, 'Covered'],
    [],
    ['Overall', 6, 7, 7, 6, 1, 'All STRIDE Categories Covered'],
  ])
}

function buildReferencesSheet() {
  return sheetFromRows([
    ['Standards Basis and Source References'],
    [],
    ['Framework / Source', 'Use in this Workbook', 'Note'],
    ['FURPS Model', 'System quality evaluation structure (F, U, R, P, S)', 'Functionality, Usability, Reliability, Performance, Security'],
    ['OWASP ASVS 5.0.0', 'Security testing reference for STRIDE test cases', 'Aligned with capstone security evaluation'],
    ['STRIDE Threat Model', 'Security summary and test coverage categories', 'Microsoft threat modeling categories'],
    ['LenLearn Post-Test Questionnaire', 'Primary data source for FURPS Responses', 'Google Forms export — 96 respondents'],
    [],
    ['Note: This workbook evaluates perceived system quality from survey responses and structured security test results. It does not claim full ASVS compliance or certification.'],
  ])
}

function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV
  if (!fs.existsSync(csvPath)) {
    console.error(`CSV not found: ${csvPath}`)
    process.exit(1)
  }

  const analysis = loadAndAnalyze(csvPath)
  const catalog = buildItemCatalog(analysis.columnKeys)

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, buildReadmeSheet(), 'README')
  XLSX.utils.book_append_sheet(wb, buildSettingsSheet(), 'Settings & Scale')
  XLSX.utils.book_append_sheet(wb, buildFurpsItemsSheet(catalog), 'FURPS Items')
  XLSX.utils.book_append_sheet(wb, buildFurpsResponsesSheet(analysis, catalog), 'FURPS Responses')
  XLSX.utils.book_append_sheet(wb, buildFurpsSummarySheet(analysis), 'FURPS Summary')
  XLSX.utils.book_append_sheet(wb, buildFurpsDetailSheet(analysis), 'FURPS Detail')
  XLSX.utils.book_append_sheet(wb, buildSecurityItemsSheet(catalog), 'Security Items')
  XLSX.utils.book_append_sheet(wb, buildSecurityResponsesSheet(analysis, catalog), 'Security Responses')
  XLSX.utils.book_append_sheet(wb, buildSecuritySummarySheet(analysis), 'Security Summary')
  XLSX.utils.book_append_sheet(wb, buildStrideTestCasesSheet(), 'STRIDE Test Cases')
  XLSX.utils.book_append_sheet(wb, buildTestCoverageSheet(), 'Test Coverage')
  XLSX.utils.book_append_sheet(wb, buildReferencesSheet(), 'References')

  fs.mkdirSync(path.dirname(OUTPUT_XLSX), { recursive: true })
  XLSX.writeFile(wb, OUTPUT_XLSX)

  console.log('LenLearn FURPS Evaluation Workbook generated.')
  console.log(`  CSV:    ${csvPath}`)
  console.log(`  Output: ${OUTPUT_XLSX}`)
  console.log(`  Responses: ${analysis.totalResponses} (Student: ${analysis.byRole.Student.length}, Teacher: ${analysis.byRole.Teacher.length}, Administrator: ${analysis.byRole.Administrator.length})`)
  console.log('  FURPS Overall (pooled):')
  for (const furps of FURPS_ORDER) {
    const r = analysis.results.Student[furps]
    console.log(`    ${furps} — ${FURPS_LABELS[furps]}: Student ${r.overall?.toFixed(2)} | Teacher ${analysis.results.Teacher[furps].overall?.toFixed(2)} | Admin ${analysis.results.Administrator[furps].overall?.toFixed(2)}`)
  }
}

const isWorkbookDirectRun =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isWorkbookDirectRun) main()
