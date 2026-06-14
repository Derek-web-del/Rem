/**
 * Generates docs/Frontend-Module-Inventory.docx from markdown source.
 *
 * Run: npm run docs:module-inventory
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  AlignmentType,
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
const MD_PATH = path.join(ROOT, 'docs', 'Frontend-Module-Inventory.md')
const OUT_PATH = path.join(ROOT, 'docs', 'Frontend-Module-Inventory.docx')

const FONT_BODY = 'Calibri'
const FONT_CODE = 'Courier New'
const SIZE_BODY = 22

/** Strip markdown link syntax to plain text. */
function stripLinks(text) {
  return String(text ?? '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
}

/** Parse inline **bold** and `code` into TextRun array. */
function parseInline(text, opts = {}) {
  const { size = SIZE_BODY, font = FONT_BODY } = opts
  const runs = []
  const src = stripLinks(text)
  const re = /(\*\*[^*]+\*\*|`[^`]+`)/g
  let last = 0
  let m
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) {
      runs.push(new TextRun({ text: src.slice(last, m.index), size, font }))
    }
    const token = m[0]
    if (token.startsWith('**')) {
      runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size, font }))
    } else {
      runs.push(new TextRun({ text: token.slice(1, -1), size, font: FONT_CODE }))
    }
    last = m.index + token.length
  }
  if (last < src.length) {
    runs.push(new TextRun({ text: src.slice(last), size, font }))
  }
  if (runs.length === 0) {
    runs.push(new TextRun({ text: src, size, font }))
  }
  return runs
}

function paragraphFromText(text, opts = {}) {
  const {
    heading,
    alignment,
    spacing = { after: 100 },
    indent,
    bullet,
  } = opts
  const children = parseInline(text)
  const paraOpts = { children, spacing }
  if (heading) paraOpts.heading = heading
  if (alignment) paraOpts.alignment = alignment
  if (indent) paraOpts.indent = indent
  if (bullet != null) paraOpts.bullet = { level: bullet }
  return new Paragraph(paraOpts)
}

function tableCell(text, opts = {}) {
  const { bold = false, widthPct } = opts
  const plain = stripLinks(String(text ?? ''))
  const children = bold
    ? [new TextRun({ text: plain, bold: true, size: SIZE_BODY, font: FONT_BODY })]
    : parseInline(plain)
  return new TableCell({
    width: widthPct != null ? { size: widthPct, type: WidthType.PERCENTAGE } : undefined,
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children })],
  })
}

function parseTableRow(line) {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

function isTableSeparator(line) {
  return /^\|[\s\-:|]+\|$/.test(line.trim())
}

function buildTable(lines) {
  const rows = lines.filter((l) => !isTableSeparator(l)).map(parseTableRow)
  if (rows.length === 0) return null
  const colCount = rows[0].length
  const widthPct = Math.floor(100 / colCount)
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: rows.map((cols, rowIdx) =>
      new TableRow({
        tableHeader: rowIdx === 0,
        children: cols.map((c) => tableCell(c, { bold: rowIdx === 0, widthPct })),
      }),
    ),
  })
}

function classifyLine(line) {
  const trimmed = line.trimEnd()
  if (trimmed === '' || trimmed === '---') return { type: 'skip' }
  if (trimmed.startsWith('# ')) return { type: 'h1', text: trimmed.slice(2).trim() }
  if (trimmed.startsWith('## ')) return { type: 'h2', text: trimmed.slice(3).trim() }
  if (trimmed.startsWith('### ')) return { type: 'h3', text: trimmed.slice(4).trim() }
  if (trimmed.startsWith('|')) return { type: 'table-row', text: trimmed }

  const leading = line.match(/^(\s*)/)?.[1]?.length ?? 0

  if (/^[a-z]\.\s+/i.test(trimmed)) {
    return { type: 'letter', text: trimmed, indent: 0 }
  }
  if (/^\s{3,}[ivxlcdm]+\.\s+/i.test(line)) {
    return { type: 'roman', text: trimmed, indent: 360 }
  }
  if (/^\s{9,}-\s+/.test(line)) {
    return { type: 'bullet', text: trimmed.replace(/^\s+-\s+/, ''), indent: 1080, level: 1 }
  }
  if (/^\s{6,}-\s+/.test(line)) {
    return { type: 'bullet', text: trimmed.replace(/^\s+-\s+/, ''), indent: 720, level: 0 }
  }
  if (/^\s{3,}-\s+/.test(line)) {
    return { type: 'bullet', text: trimmed.replace(/^\s+-\s+/, ''), indent: 540, level: 0 }
  }
  if (/^\s*-\s+/.test(trimmed)) {
    return { type: 'bullet', text: trimmed.replace(/^-\s+/, ''), indent: 360, level: 0 }
  }
  if (/^\*\*.+\*\*/.test(trimmed) && trimmed.includes(':')) {
    return { type: 'metadata', text: trimmed }
  }
  if (trimmed.startsWith('*') && trimmed.endsWith('*') && !trimmed.startsWith('**')) {
    return { type: 'italic', text: trimmed.slice(1, -1) }
  }

  return { type: 'paragraph', text: trimmed, indent: leading > 0 ? Math.min(leading * 20, 400) : 0 }
}

function markdownToDocxChildren(markdown) {
  const lines = markdown.split(/\r?\n/)
  const children = []
  let firstH1 = true
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const cls = classifyLine(line)

    if (cls.type === 'table-row') {
      const tableLines = []
      while (i < lines.length && classifyLine(lines[i]).type === 'table-row') {
        tableLines.push(lines[i])
        i++
      }
      const table = buildTable(tableLines)
      if (table) {
        children.push(table)
        children.push(new Paragraph({ text: '', spacing: { after: 160 } }))
      }
      continue
    }

    if (cls.type === 'skip') {
      i++
      continue
    }

    if (cls.type === 'h1') {
      if (firstH1) {
        children.push(
          new Paragraph({
            children: parseInline(cls.text),
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
          }),
        )
        firstH1 = false
      } else {
        children.push(
          paragraphFromText(cls.text, {
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 280, after: 120 },
          }),
        )
      }
      i++
      continue
    }

    if (cls.type === 'h2') {
      children.push(
        paragraphFromText(cls.text, {
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 240, after: 100 },
        }),
      )
      i++
      continue
    }

    if (cls.type === 'h3') {
      children.push(
        paragraphFromText(cls.text, {
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        }),
      )
      i++
      continue
    }

    if (cls.type === 'metadata') {
      const match = cls.text.match(/^\*\*([^*]+)\*\*\s*(.*)$/)
      if (match) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: `${match[1]}`, bold: true, size: SIZE_BODY, font: FONT_BODY }),
              new TextRun({ text: ` ${match[2]}`, size: SIZE_BODY, font: FONT_BODY }),
            ],
            spacing: { after: 80 },
          }),
        )
      } else {
        children.push(paragraphFromText(cls.text, { spacing: { after: 80 } }))
      }
      i++
      continue
    }

    if (cls.type === 'italic') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: cls.text, italics: true, size: SIZE_BODY, font: FONT_BODY })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
        }),
      )
      i++
      continue
    }

    if (cls.type === 'letter') {
      children.push(
        paragraphFromText(cls.text, {
          spacing: { before: 100, after: 60 },
          indent: { left: cls.indent },
        }),
      )
      i++
      continue
    }

    if (cls.type === 'roman') {
      children.push(
        paragraphFromText(cls.text, {
          spacing: { after: 40 },
          indent: { left: cls.indent },
        }),
      )
      i++
      continue
    }

    if (cls.type === 'bullet') {
      children.push(
        paragraphFromText(cls.text, {
          spacing: { after: 60 },
          indent: { left: cls.indent },
          bullet: cls.level,
        }),
      )
      i++
      continue
    }

    children.push(
      paragraphFromText(cls.text, {
        spacing: { after: 100 },
        indent: cls.indent ? { left: cls.indent } : undefined,
      }),
    )
    i++
  }

  return children
}

async function main() {
  if (!fs.existsSync(MD_PATH)) {
    throw new Error(`Missing ${path.relative(ROOT, MD_PATH)}`)
  }
  const markdown = fs.readFileSync(MD_PATH, 'utf8')
  const children = markdownToDocxChildren(markdown)

  const doc = new Document({
    sections: [{ properties: {}, children }],
  })

  const buffer = await Packer.toBuffer(doc)
  fs.mkdirSync(path.dirname(OUT_PATH), { recursive: true })
  fs.writeFileSync(OUT_PATH, buffer)
  console.log(`[docs:module-inventory] wrote ${path.relative(ROOT, OUT_PATH)} (${children.length} blocks)`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
