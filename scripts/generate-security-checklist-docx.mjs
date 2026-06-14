/**
 * Generates docs/Cybersecurity-Development-Scope-Checklist.docx from checklist data.
 *
 * Run: npm run docs:security-checklist
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_PATH = path.join(ROOT, 'docs', 'cybersecurity-checklist-data.json')
const OUT_PATH = path.join(ROOT, 'docs', 'Cybersecurity-Development-Scope-Checklist.docx')

function loadData() {
  if (!fs.existsSync(DATA_PATH)) {
    throw new Error(`Missing ${path.relative(ROOT, DATA_PATH)} — run checklist scan first.`)
  }
  return JSON.parse(fs.readFileSync(DATA_PATH, 'utf8'))
}

function cell(text, opts = {}) {
  const { bold = false, width = 15 } = opts
  return new TableCell({
    width: { size: width, type: WidthType.PERCENTAGE },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [
      new Paragraph({
        children: [new TextRun({ text: String(text ?? ''), bold, size: 20 })],
      }),
    ],
  })
}

function headerRow(cols) {
  return new TableRow({
    tableHeader: true,
    children: cols.map((c, i) =>
      cell(c, { bold: true, width: i === 1 ? 28 : i === 4 ? 25 : 12 }),
    ),
  })
}

function dataRow(row) {
  return new TableRow({
    children: [
      cell(row.id, { width: 8 }),
      cell(row.task, { width: 28 }),
      cell(row.status, { width: 12 }),
      cell(
        row.status === 'N/A' || row.percent === 'N/A' || row.percent == null
          ? 'N/A'
          : `${row.percent}%`,
        { width: 8 },
      ),
      cell(row.evidence, { width: 25 }),
      cell(row.remarks, { width: 19 }),
    ],
  })
}

function checklistTable(rows) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      headerRow(['#', 'Specific Modules / Tasks', 'Status', '%', 'Evidence / Proof', 'Remarks']),
      ...rows.map(dataRow),
    ],
  })
}

function bulletList(items) {
  return items.map(
    (text) =>
      new Paragraph({
        text,
        bullet: { level: 0 },
        spacing: { after: 80 },
      }),
  )
}

async function main() {
  const data = loadData()
  const { meta, areas, frsGaps, evidenceStillNeeded } = data

  const children = [
    new Paragraph({
      text: meta.title,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Project: ${meta.project}`, break: 1 }),
        new TextRun({ text: `Generated: ${meta.generatedAt}`, break: 1 }),
        new TextRun({ text: meta.frsStatus, break: 1, italics: true }),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({
      text: 'FRS-Based Checking Note',
      heading: HeadingLevel.HEADING_2,
    }),
    new Paragraph({
      text: 'All web modules, security components, user roles, workflows, and database features checked in this section must be based on the signed and approved Functional Requirements Specification (FRS). Only items included in the approved FRS, or formally approved through adviser/client-validated change requests, should be counted in the progress percentage.',
      spacing: { after: 200 },
    }),
    new Paragraph({
      text: 'C.1 Development Scope and Security Components',
      heading: HeadingLevel.HEADING_1,
      spacing: { before: 240, after: 120 },
    }),
  ]

  for (const area of areas) {
    children.push(
      new Paragraph({
        text: `${area.id}. ${area.title}`,
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 200, after: 80 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: `Area completion: ${area.areaPercent}%`, bold: true }),
          new TextRun({ text: ` — ${area.description}`, break: 0 }),
        ],
        spacing: { after: 120 },
      }),
      checklistTable(area.rows),
      new Paragraph({ text: '', spacing: { after: 160 } }),
    )
  }

  children.push(
    new Paragraph({
      text: 'TOTAL',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: 'Total completion percentage: ', bold: true }),
        new TextRun({ text: `${meta.totalPercent}%`, bold: true, size: 28 }),
      ],
      spacing: { after: 120 },
    }),
    new Paragraph({
      text: 'Note: Total = average of included area percentages. N/A areas excluded unless required by mentor.',
      spacing: { after: 200 },
    }),
    new Paragraph({
      text: 'FRS Gaps and Out-of-Scope Items',
      heading: HeadingLevel.HEADING_2,
    }),
    ...frsGaps.flatMap((g) => [
      new Paragraph({
        children: [
          new TextRun({ text: `${g.item}: `, bold: true }),
          new TextRun({ text: g.disposition }),
        ],
        spacing: { after: 80 },
      }),
    ]),
    new Paragraph({
      text: 'Evidence Still Needed',
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 200 },
    }),
    ...bulletList(evidenceStillNeeded),
  )

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, buffer)
  console.log(`[docs:security-checklist] wrote ${path.relative(ROOT, OUT_PATH)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
