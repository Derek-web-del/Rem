export function itemKey(type, id) {
  return `${String(type || '').toLowerCase()}:${Number(id)}`
}

export function parseItemKey(key) {
  const parts = String(key || '').split(':')
  return {
    entity_type: parts[0] || '',
    entity_id: Number(parts[1]),
  }
}

export function clampScore(raw, maxPoints) {
  const max = Number(maxPoints) || 0
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  if (max > 0 && n > max) return max
  return n
}

export function computeComponentAvgFromPoints(items, getScore) {
  const list = Array.isArray(items) ? items : []
  let earned = 0
  let possible = 0
  for (const item of list) {
    const max = Number(item?.max_points) || 0
    if (max <= 0) continue
    possible += max
    earned += clampScore(getScore(item), max)
  }
  if (possible <= 0) return 0
  return Math.round((earned / possible) * 100)
}

export function computeFinalGrade(components, componentAvgs) {
  const comps = Array.isArray(components) ? components : []
  let sum = 0
  for (const comp of comps) {
    const weight = Number(comp?.percentage ?? 0)
    if (!Number.isFinite(weight) || weight <= 0) continue
    const avg = Number(componentAvgs?.[String(comp.id)] ?? 0)
    sum += (weight / 100) * (Number.isFinite(avg) ? avg : 0)
  }
  return Math.round(sum * 100) / 100
}

export function groupItemsByComponent(components, items) {
  const comps = Array.isArray(components) ? components : []
  const list = Array.isArray(items) ? items : []
  const quizComponent = comps.find((c) => c.is_quiz)
  const grouped = {}
  for (const comp of comps) {
    grouped[String(comp.id)] = []
  }

  for (const item of list) {
    const type = String(item.type || '').toLowerCase()
    let compId = item.grade_component_id != null ? String(item.grade_component_id) : null

    if (type === 'quiz' && !compId) {
      compId = quizComponent ? String(quizComponent.id) : compId
    }

    if (compId && grouped[compId]) {
      grouped[compId].push(item)
    } else if (quizComponent && type === 'quiz') {
      grouped[String(quizComponent.id)].push(item)
    }
  }

  return grouped
}

export function computeStudentGradeRow(components, groupedItems, scoresForStudent) {
  const componentAvgs = {}
  for (const comp of components || []) {
    const compItems = groupedItems[String(comp.id)] || []
    componentAvgs[String(comp.id)] = computeComponentAvgFromPoints(compItems, (item) => {
      const key = itemKey(item.type, item.id)
      return scoresForStudent?.[key] ?? 0
    })
  }
  const finalGrade = computeFinalGrade(components, componentAvgs)
  return { componentAvgs, finalGrade }
}

export function computeClassAverages(students, components, groupedItems, scoresMap, items) {
  const studentRows = (students || []).map((st) => {
    const sid = String(st.id ?? st.student_id)
    return computeStudentGradeRow(components, groupedItems, scoresMap?.[sid] || {})
  })

  const columnAvgs = {}
  for (const item of items || []) {
    const key = itemKey(item.type, item.id)
    const vals = (students || []).map((st) => Number(scoresMap?.[String(st.id)]?.[key] ?? 0))
    columnAvgs[key] =
      vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0
  }

  const componentAvgs = {}
  for (const comp of components || []) {
    const cid = String(comp.id)
    const vals = studentRows.map((r) => Number(r.componentAvgs[cid] ?? 0))
    componentAvgs[cid] =
      vals.length > 0 ? Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 100) / 100 : 0
  }

  const finalVals = studentRows.map((r) => Number(r.finalGrade ?? 0))
  const finalGrade =
    finalVals.length > 0
      ? Math.round((finalVals.reduce((a, b) => a + b, 0) / finalVals.length) * 100) / 100
      : 0

  return { columnAvgs, componentAvgs, finalGrade }
}

export function gradeRemarks(finalGrade) {
  const n = Number(finalGrade)
  if (!Number.isFinite(n)) return 'Needs Improvement'
  if (n >= 90) return 'Excellent'
  if (n >= 85) return 'Very Good'
  if (n >= 80) return 'Good'
  if (n >= 75) return 'Satisfactory'
  return 'Needs Improvement'
}
