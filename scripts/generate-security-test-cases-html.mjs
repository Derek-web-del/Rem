/**
 * Generates docs/security_test_cases.html from security-test-cases-data.json.
 *
 * Run: npm run docs:security-test-cases
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_PATH = path.join(ROOT, 'docs', 'security-test-cases-data.json')
const OUT_PATH = path.join(ROOT, 'docs', 'security_test_cases.html')

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function sectionId(heading) {
  return heading.toLowerCase().replace(/\s+/g, '-')
}

function renderTable(columns, cases) {
  const head = columns.map((c) => `<th>${esc(c)}</th>`).join('\n      ')
  const rows = cases
    .map(
      (c) => `<tr>
      <td class="id">${esc(c.testId)}</td>
      <td>${esc(c.securityTestCase)}</td>
      <td>${esc(c.owaspAsvs)}</td>
      <td>${esc(c.objective)}</td>
      <td>${esc(c.testProcedure)}</td>
      <td>${esc(c.expectedResult)}</td>
      <td>${esc(c.metric)}</td>
      <td>${esc(c.acceptanceCriteria)}</td>
    </tr>`,
    )
    .join('\n    ')
  return `<div class="table-wrap">
  <table>
    <thead><tr>
      ${head}
    </tr></thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
</div>`
}

function main() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Missing ${path.relative(ROOT, DATA_PATH)}`)
  }
  const data = JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
  const { meta, columns, sections } = data

  const tocItems = sections
    .map((s) => `<li><a href="#${sectionId(s.heading)}">${esc(s.heading)}</a></li>`)
    .join('\n    ')

  const sectionBlocks = sections
    .map((s) => {
      const id = sectionId(s.heading)
      return `<h2 id="${id}">${esc(s.heading)}</h2>
<p class="module-note"><strong>Module:</strong> ${esc(s.module)} &nbsp;|&nbsp; <strong>Chapter 4 Evidence:</strong> ${esc(s.chapter4Evidence)}</p>
${renderTable(columns, s.cases)}`
    })
    .join('\n\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(meta.title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: Calibri, "Segoe UI", Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      color: #000;
      max-width: 1200px;
      margin: 0 auto;
      padding: 32px 40px 48px;
      background: #fff;
    }
    h1 {
      font-size: 16pt;
      font-weight: bold;
      text-align: center;
      margin-bottom: 20px;
    }
    .intro {
      text-align: justify;
      margin-bottom: 16px;
    }
    .intro p { margin-bottom: 10px; }
    nav.toc {
      border: 1px solid #000;
      padding: 12px 16px;
      margin: 16px 0 24px;
      background: #fafafa;
    }
    nav.toc ul {
      columns: 2;
      margin: 8px 0 0 20px;
    }
    nav.toc a { color: #000; }
    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 28px 0 8px;
    }
    .module-note {
      font-size: 10pt;
      color: #333;
      margin-bottom: 10px;
    }
    .table-wrap {
      overflow-x: auto;
      margin: 8px 0 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 10pt;
      min-width: 960px;
    }
    thead th {
      background: #d9d9d9;
      color: #000;
      font-weight: bold;
      padding: 8px 6px;
      text-align: left;
      border: 1px solid #000;
      vertical-align: top;
    }
    tbody td {
      padding: 8px 6px;
      border: 1px solid #000;
      vertical-align: top;
      text-align: left;
    }
    td.id {
      font-weight: bold;
      white-space: nowrap;
    }
    @media print {
      body { padding: 24px; }
      nav.toc { break-after: avoid; }
      h2 { break-after: avoid; }
      table { font-size: 9pt; }
    }
  </style>
</head>
<body>

<h1>${esc(meta.title)}</h1>

<div class="intro">
  <p>This document defines structured security test cases for <strong>${esc(meta.project)}</strong>. Cases are aligned to the LenLearn Security Evaluation Matrix (research objectives, functional modules, FURPS evaluation areas, STRIDE threat categories, and expected Chapter 4 evidence sections). Each test follows the eight-column format used for capstone security evaluation documentation.</p>
  <p><strong>Scope:</strong> ${esc(meta.scope)} Evaluation environment: ${esc(meta.environment)}. This document specifies test design only; execution results are recorded separately during evaluation.</p>
</div>

<nav class="toc">
  <strong>Contents</strong>
  <ul>
    ${tocItems}
  </ul>
</nav>

${sectionBlocks}

</body>
</html>
`

  fs.writeFileSync(OUT_PATH, html, 'utf8')
  console.log(`[docs:security-test-cases] wrote ${path.relative(ROOT, OUT_PATH)}`)
}

main()
