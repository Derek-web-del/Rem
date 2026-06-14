import * as XLSX from 'xlsx'
import {
  computeClassAverages,
  computeStudentGradeRow,
  gradeRemarks,
  groupItemsByComponent,
  itemKey,
} from './gradebookCalc.js'

function sanitizeFilenamePart(value) {
  return String(value || 'Unknown')
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, '_')
    .trim()
}

function hexToExcelRgb(hex) {
  const h = String(hex || '#3B82F6').replace('#', '')
  if (h.length !== 6) return 'FF3B82F6'
  return `FF${h.toUpperCase()}`
}

export function exportGradebookXlsx({ subject, sectionName, components, items, students, scoresMap }) {
  const groupedItems = groupItemsByComponent(components, items)
  const columns = []
  for (const comp of components || []) {
    const compItems = groupedItems[String(comp.id)] || []
    if (!compItems.length) continue
    columns.push({ comp, items: compItems })
  }

  const classAvgs = computeClassAverages(students, components, groupedItems, scoresMap, items)
  const rows = []

  const headerRow1 = ['Student']
  const headerRow2 = ['']
  const merges = []

  let col = 1
  for (const { comp, items: compItems } of columns) {
    const span = compItems.length + 1
    headerRow1.push(`${comp.name} (${comp.percentage}%)`)
    for (let i = 1; i < span; i += 1) headerRow1.push('')
    if (span > 1) {
      merges.push({ s: { r: 0, c: col }, e: { r: 0, c: col + span - 1 } })
    }
    for (const item of compItems) {
      headerRow2.push(`${item.title} / ${item.max_points} pts`)
    }
    headerRow2.push('Avg %')
    col += span
  }
  headerRow1.push('Final Grade')
  headerRow2.push('')
  merges.push({ s: { r: 0, c: col }, e: { r: 1, c: col } })
  rows.push(headerRow1, headerRow2)

  for (const student of students || []) {
    const sid = String(student.id)
    const rowData = computeStudentGradeRow(components, groupedItems, scoresMap[sid] || {})
    const row = [student.name]
    for (const { comp, items: compItems } of columns) {
      for (const item of compItems) {
        const key = itemKey(item.type, item.id)
        row.push(Number(scoresMap[sid]?.[key] ?? 0))
      }
      row.push(Number(rowData.componentAvgs[String(comp.id)] ?? 0))
    }
    row.push(Number(rowData.finalGrade ?? 0))
    rows.push(row)
  }

  const avgRow = ['Class Average']
  for (const { comp, items: compItems } of columns) {
    for (const item of compItems) {
      const key = itemKey(item.type, item.id)
      avgRow.push(Number(classAvgs.columnAvgs[key] ?? 0))
    }
    avgRow.push(Number(classAvgs.componentAvgs[String(comp.id)] ?? 0))
  }
  avgRow.push(Number(classAvgs.finalGrade ?? 0))
  rows.push(avgRow)

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!merges'] = merges

  for (let c = 0; c < headerRow1.length; c += 1) {
    const addr = XLSX.utils.encode_cell({ r: 0, c })
    if (!ws[addr]) continue
    const compIdx = columns.findIndex((_, i) => {
      let start = 1
      for (let j = 0; j < i; j += 1) start += columns[j].items.length + 1
      const end = start + columns[i].items.length
      return c >= start && c <= end
    })
    if (compIdx >= 0) {
      ws[addr].s = {
        fill: { fgColor: { rgb: hexToExcelRgb(columns[compIdx].comp.color) } },
        font: { bold: true },
      }
    }
  }

  const summaryRows = [['Student Name', 'Final Grade', 'Remarks']]
  for (const student of students || []) {
    const sid = String(student.id)
    const { finalGrade } = computeStudentGradeRow(components, groupedItems, scoresMap[sid] || {})
    summaryRows.push([student.name, Number(finalGrade ?? 0), gradeRemarks(finalGrade)])
  }

  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gradebook')
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Grade Summary')

  const date = new Date().toISOString().slice(0, 10)
  const filename = `Gradebook_${sanitizeFilenamePart(subject?.subject_name)}_${sanitizeFilenamePart(sectionName)}_${date}.xlsx`
  XLSX.writeFile(wb, filename)
}
