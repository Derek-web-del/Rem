import { useCallback, useEffect, useMemo, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { fetchSectionGradesOverview } from '../../lib/gradesApi.js'
import { fetchTeacherAdvisorySections } from '../../lib/teacherPortalOffline.js'
import OfflineCacheIndicator from '../../components/OfflineCacheIndicator.jsx'
import { formatGradeAvg } from '../../lib/gradeStatus.js'
import { GradesStatusBadge } from '../../components/GradesPanel.jsx'
import TeacherMainHeader from './TeacherMainHeader.jsx'

function MetricCard({ label, value, sub }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-neutral-900">{value}</p>
      {sub ? <p className="mt-1 text-xs text-neutral-500">{sub}</p> : null}
    </div>
  )
}

function SubjectGradeCell({ overallAvg, hasScoredItems }) {
  if (!hasScoredItems) {
    return <span className="text-neutral-400">—</span>
  }
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="font-medium tabular-nums text-neutral-900">{formatGradeAvg(overallAvg)}</span>
      <GradesStatusBadge percent={overallAvg} noScoresYet={false} />
    </div>
  )
}

export default function GradesOverview() {
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const [sections, setSections] = useState([])
  const [sectionId, setSectionId] = useState('')
  const [subjects, setSubjects] = useState([])
  const [rows, setRows] = useState([])
  const [loadingSections, setLoadingSections] = useState(true)
  const [loadingGrades, setLoadingGrades] = useState(false)
  const [error, setError] = useState('')
  const [fromCache, setFromCache] = useState(false)

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoadingSections(true)
      setError('')
      try {
        const secList = await fetchTeacherAdvisorySections()
        if (cancelled) return
        setSections(secList)
        if (secList.length > 0) {
          setSectionId(String(secList[0].id ?? secList[0].postgresSectionId ?? ''))
        }
      } catch (e) {
        if (!cancelled) setError(String(e?.message || e || 'Could not load sections.'))
      } finally {
        if (!cancelled) setLoadingSections(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const loadGrades = useCallback(async () => {
    if (!sectionId) return
    setLoadingGrades(true)
    setError('')
    setFromCache(false)
    try {
      const data = await fetchSectionGradesOverview(sectionId)
      setSubjects(Array.isArray(data.subjects) ? data.subjects : [])
      setRows(Array.isArray(data.students) ? data.students : [])
      setFromCache(Boolean(data.fromCache))
    } catch (e) {
      setSubjects([])
      setRows([])
      setError(String(e?.message || e || 'Could not load grades.'))
    } finally {
      setLoadingGrades(false)
    }
  }, [sectionId])

  useEffect(() => {
    if (sectionId) void loadGrades()
  }, [sectionId, loadGrades])

  const metrics = useMemo(() => {
    const scoredCells = []
    for (const row of rows) {
      const grades = row?.subject_grades && typeof row.subject_grades === 'object' ? row.subject_grades : {}
      for (const cell of Object.values(grades)) {
        if (cell?.has_scored_items && Number.isFinite(Number(cell.overall_avg))) {
          scoredCells.push(Number(cell.overall_avg))
        }
      }
    }
    const sectionAvg =
      scoredCells.length > 0
        ? Math.round(scoredCells.reduce((a, b) => a + b, 0) / scoredCells.length)
        : 0
    let passing = 0
    let atRisk = 0
    let failing = 0
    for (const p of scoredCells) {
      if (p >= 75) passing += 1
      else if (p >= 60) atRisk += 1
      else failing += 1
    }
    return { sectionAvg, passing, atRisk, failing, total: scoredCells.length }
  }, [rows])

  const sectionLabel = useMemo(() => {
    const sec = sections.find((s) => String(s.id) === String(sectionId))
    if (!sec) return 'Section'
    const name = String(sec.name || sec.section_name || 'Section').trim()
    const grade = String(sec.grade_level || sec.grade || '').trim()
    return grade ? `${grade} — ${name}` : name
  }, [sections, sectionId])

  const colSpan = 1 + subjects.length

  return (
    <>
      <TeacherMainHeader pageTitle="Grades Overview" />
      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4 md:p-8">
        <div className="space-y-6">
          <div>
            <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Grades Overview</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Overall subject grades for students in your advisory sections (your subjects at that grade level).
            </p>
          </div>

          <section className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm md:p-5">
            <label className="text-sm font-medium text-neutral-700">
              Section
              <select
                className="mt-1 block min-w-[220px] rounded-lg border border-neutral-200 px-3 py-2 text-sm"
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                disabled={loadingSections || sections.length === 0}
              >
                {sections.length === 0 ? <option value="">No sections assigned</option> : null}
                {sections.map((s) => (
                  <option key={String(s.id)} value={String(s.id)}>
                    {[s.grade_level || s.grade, s.name || s.section_name].filter(Boolean).join(' — ') ||
                      `Section ${s.id}`}
                  </option>
                ))}
              </select>
            </label>
          </section>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
          ) : null}
          <OfflineCacheIndicator fromCache={fromCache} className="mb-2" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="Section average" value={formatGradeAvg(metrics.sectionAvg)} sub={sectionLabel} />
            <MetricCard label="Passing (≥75%)" value={String(metrics.passing)} sub={`of ${metrics.total} graded cells`} />
            <MetricCard label="At risk (60–74%)" value={String(metrics.atRisk)} />
            <MetricCard label="Failing (&lt;60%)" value={String(metrics.failing)} />
          </div>

          <section className="overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="border-b border-neutral-100 px-4 py-3 md:px-6">
              <h3 className="text-sm font-semibold text-neutral-900">Students — {sectionLabel}</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead className="bg-neutral-50 text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  <tr>
                    <th className="sticky left-0 z-10 bg-neutral-50 px-4 py-3 text-left shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                      Student
                    </th>
                    {subjects.map((sub) => (
                      <th key={String(sub.id)} className="min-w-[120px] px-4 py-3 text-left">
                        <span className="block truncate">{sub.subject_name || sub.name || 'Subject'}</span>
                        {sub.subject_code ? (
                          <span className="mt-0.5 block truncate text-[10px] font-normal normal-case text-neutral-400">
                            {sub.subject_code}
                          </span>
                        ) : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {loadingGrades ? (
                    <tr>
                      <td colSpan={colSpan || 1} className="px-4 py-10 text-center text-neutral-500">
                        Loading grades…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={colSpan || 1} className="px-4 py-10 text-center text-neutral-500">
                        No students in this section yet.
                      </td>
                    </tr>
                  ) : subjects.length === 0 ? (
                    <tr>
                      <td colSpan={1} className="px-4 py-10 text-center text-neutral-500">
                        No subjects assigned to you for this section&apos;s grade level.
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr key={row.student_id} className="text-neutral-800">
                        <td className="sticky left-0 z-10 bg-white px-4 py-3 font-medium text-neutral-900 shadow-[2px_0_4px_-2px_rgba(0,0,0,0.08)]">
                          {row.student_name}
                        </td>
                        {subjects.map((sub) => {
                          const cell = row?.subject_grades?.[String(sub.id)] ?? {}
                          return (
                            <td key={String(sub.id)} className="px-4 py-3">
                              <SubjectGradeCell
                                overallAvg={cell.overall_avg}
                                hasScoredItems={Boolean(cell.has_scored_items)}
                              />
                            </td>
                          )
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </main>
    </>
  )
}
