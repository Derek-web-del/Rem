import { Fragment, useMemo } from 'react'
import {
  computeClassAverages,
  computeStudentGradeRow,
  groupItemsByComponent,
  itemKey,
} from '../../../../lib/gradebookCalc.js'
import { ACTION_BLUE } from '../../instituteChrome.js'

const TYPE_LABELS = {
  assignment: 'Assignment',
  activity: 'Activity',
  quiz: 'Quiz',
}

function typeBadgeClass(type) {
  const t = String(type || '').toLowerCase()
  if (t === 'quiz') return 'bg-violet-100 text-violet-800'
  if (t === 'activity') return 'bg-emerald-100 text-emerald-800'
  return 'bg-sky-100 text-sky-800'
}

export default function GradebookTable({ components, items, students, scoresMap, onScoreChange }) {
  const groupedItems = useMemo(() => groupItemsByComponent(components, items), [components, items])

  const columns = useMemo(() => {
    const cols = []
    for (const comp of components || []) {
      const compItems = groupedItems[String(comp.id)] || []
      if (!compItems.length) continue
      cols.push({
        comp,
        items: compItems,
      })
    }
    return cols
  }, [components, groupedItems])

  const classAvgs = useMemo(
    () => computeClassAverages(students, components, groupedItems, scoresMap, items),
    [students, components, groupedItems, scoresMap, items],
  )

  if (!components?.length) return null

  return (
    <div className="gradebook-table-wrap overflow-x-auto overflow-y-auto max-h-[calc(100vh-280px)]">
      <table className="gradebook-table min-w-full border-collapse text-xs whitespace-nowrap">
        <thead>
          <tr className="gradebook-h-criteria">
            <th rowSpan={2} className="gradebook-name-header sticky left-0 z-20 bg-neutral-100 px-3 py-2 text-left font-medium text-neutral-600">
              Student
            </th>
            {columns.map(({ comp, items: compItems }) => (
              <th
                key={`crit-${comp.id}`}
                colSpan={compItems.length + 1}
                className="border border-neutral-200 px-2 py-1.5 text-left font-medium"
                style={{ backgroundColor: `${comp.color}22`, borderBottomColor: comp.color }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: comp.color }} />
                  {comp.name} ({comp.percentage}%)
                </span>
              </th>
            ))}
            <th rowSpan={2} className="gradebook-final-header sticky right-0 z-20 bg-neutral-100 px-3 py-2 text-center font-medium text-neutral-600">
              Final Grade
            </th>
          </tr>
          <tr className="gradebook-h-items bg-white">
            {columns.map(({ comp, items: compItems }) => (
              <Fragment key={`head-${comp.id}`}>
                {compItems.map((item) => (
                  <th key={itemKey(item.type, item.id)} className="border border-neutral-200 px-1 py-1 align-top">
                    <div className="gradebook-item-header flex min-w-[80px] flex-col px-1 py-1">
                      <span className="max-w-[90px] truncate font-medium text-neutral-900" title={item.title}>
                        {item.title}
                      </span>
                      <span className="text-[10px] text-neutral-500">{item.max_points} pts</span>
                      <span
                        className={`mt-0.5 self-start rounded-full px-1.5 py-0.5 text-[9px] font-medium ${typeBadgeClass(item.type)}`}
                      >
                        {TYPE_LABELS[item.type] || item.type}
                      </span>
                    </div>
                  </th>
                ))}
                <th
                  key={`sub-${comp.id}`}
                  className="border border-neutral-200 bg-neutral-50 px-2 py-1 text-center text-[10px] font-semibold text-neutral-600"
                  style={{ borderTopColor: comp.color }}
                >
                  Avg %
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {(students || []).map((student, rowIdx) => {
            const sid = String(student.id)
            const row = computeStudentGradeRow(components, groupedItems, scoresMap[sid] || {})
            return (
              <tr key={sid} className={rowIdx % 2 === 1 ? 'bg-neutral-50/80' : 'bg-white'}>
                <td className="gradebook-name-cell sticky left-0 z-10 border border-neutral-200 bg-inherit px-3 py-2 font-medium text-neutral-900">
                  {student.name}
                </td>
                {columns.map(({ comp, items: compItems }) => (
                  <Fragment key={`row-${comp.id}-${sid}`}>
                    {compItems.map((item) => {
                      const key = itemKey(item.type, item.id)
                      const val = scoresMap[sid]?.[key] ?? 0
                      return (
                        <td key={key} className="border border-neutral-200 p-0 text-center">
                          <input
                            type="number"
                            min={0}
                            max={item.max_points}
                            step={item.type === 'quiz' ? '0.01' : '1'}
                            className="gradebook-score-input w-full min-w-[68px] border-none bg-transparent px-1 py-2 text-center text-xs outline-none focus:bg-sky-50 focus:ring-2 focus:ring-inset focus:ring-[#185FA5]"
                            value={val === 0 ? '0' : String(val)}
                            onChange={(e) => onScoreChange(sid, key, e.target.value, item.max_points)}
                          />
                        </td>
                      )
                    })}
                    <td
                      key={`avg-${comp.id}-${sid}`}
                      className="border border-neutral-200 bg-neutral-50/50 px-2 py-2 text-center font-semibold tabular-nums"
                    >
                      {row.componentAvgs[String(comp.id)] ?? 0}
                    </td>
                  </Fragment>
                ))}
                <td
                  className="gradebook-final-cell sticky right-0 z-10 border border-neutral-200 bg-inherit px-3 py-2 text-center text-sm font-bold tabular-nums"
                  style={{ color: ACTION_BLUE }}
                >
                  {row.finalGrade ?? 0}
                </td>
              </tr>
            )
          })}
          <tr className="gradebook-summary-row bg-neutral-100 font-medium text-neutral-600">
            <td className="gradebook-name-cell sticky left-0 z-10 border border-neutral-300 bg-neutral-100 px-3 py-2 text-left text-[11px]">
              Class Average
            </td>
            {columns.map(({ comp, items: compItems }) => (
              <Fragment key={`head-${comp.id}`}>
                {compItems.map((item) => {
                  const key = itemKey(item.type, item.id)
                  return (
                    <td key={`cls-${key}`} className="border border-neutral-300 px-2 py-2 text-center text-[11px] tabular-nums">
                      {classAvgs.columnAvgs[key] ?? 0}
                    </td>
                  )
                })}
                <td key={`cls-comp-${comp.id}`} className="border border-neutral-300 px-2 py-2 text-center text-[11px] tabular-nums">
                  {classAvgs.componentAvgs[String(comp.id)] ?? 0}
                </td>
              </Fragment>
            ))}
            <td className="gradebook-final-cell sticky right-0 z-10 border border-neutral-300 bg-neutral-100 px-3 py-2 text-center text-[11px] font-bold tabular-nums">
              {classAvgs.finalGrade ?? 0}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
