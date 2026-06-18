import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { useFacultyNotify } from '../../../../lib/facultyNotify.js'
import { fetchSubjectGradebook } from '../../../../lib/teacherGradebook.js'
import { exportGradebookXlsx } from '../../../../lib/gradebookExport.js'
import TeacherBackButton from '../../TeacherBackButton.jsx'
import TeacherMainHeader from '../../TeacherMainHeader.jsx'
import GradebookTable from './GradebookTable.jsx'
import { ACTION_BLUE } from '../../instituteChrome.js'

function scoresFromApi(apiScores) {
  const out = {}
  for (const [sid, cells] of Object.entries(apiScores || {})) {
    out[sid] = {}
    for (const [key, cell] of Object.entries(cells || {})) {
      out[sid][key] = cell?.score != null ? Number(cell.score) : 0
    }
  }
  return out
}

export default function TeacherSubjectGradebookPage() {
  const { subjectId } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal } = useOutletContext() || {}
  const toast = useFacultyNotify()

  const [loading, setLoading] = useState(true)
  const [gradebook, setGradebook] = useState(null)
  const [sectionId, setSectionId] = useState('')
  const [scoresMap, setScoresMap] = useState({})

  const load = useCallback(async () => {
    if (!subjectId) return
    setLoading(true)
    try {
      const data = await fetchSubjectGradebook(subjectId, {
        sectionId: sectionId || undefined,
      })
      setGradebook(data)
      setScoresMap(scoresFromApi(data.scores))
      if (!sectionId && data.sections?.length) {
        setSectionId(String(data.sections[0].id))
      }
    } catch (e) {
      toast.error(String(e?.message || 'Could not load gradebook.'))
      setGradebook(null)
    } finally {
      setLoading(false)
    }
  }, [subjectId, sectionId, toast])

  useEffect(() => {
    void load()
  }, [load])

  const subjectLabel = useMemo(() => {
    if (!gradebook?.subject) return ''
    return [gradebook.subject.subject_name, gradebook.subject.grade_level].filter(Boolean).join(' · ')
  }, [gradebook])

  const sectionLabel =
    gradebook?.sections?.find((s) => String(s.id) === String(sectionId))?.section_name || 'All sections'

  function handleExport() {
    if (!gradebook) return
    try {
      exportGradebookXlsx({
        subject: gradebook.subject,
        sectionName: sectionLabel,
        components: gradebook.components,
        items: gradebook.items,
        students: gradebook.students,
        scoresMap,
      })
    } catch (e) {
      toast.error(String(e?.message || 'Could not generate report.'))
    }
  }

  const criteriaConfigured = gradebook?.configured && (gradebook?.components?.length ?? 0) > 0
  const hasItems = gradebook?.has_items

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <TeacherMainHeader logoutToPortal={logoutToPortal} />
      <div className="flex-1 overflow-auto p-4 md:p-6">
        <div className="mb-4">
          <TeacherBackButton to={`/teacher/subjects/${subjectId}?tab=grades`} label="Back to subject grades" />
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading gradebook…</p>
        ) : !gradebook ? (
          <p className="text-sm text-red-600">Gradebook not available.</p>
        ) : !criteriaConfigured ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-neutral-900">Grade criteria not set up yet</p>
            <p className="mt-2 text-sm text-neutral-600">
              Configure grading components before using the gradebook.
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              style={{ background: ACTION_BLUE }}
              onClick={() => navigate(`/teacher/subjects/${subjectId}?tab=grades`)}
            >
              Set up grade criteria
            </button>
          </div>
        ) : !hasItems ? (
          <div className="rounded-xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
            <p className="text-base font-semibold text-neutral-900">
              No assignments, activities, or quizzes have been created for this subject yet
            </p>
            <button
              type="button"
              className="mt-4 rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110"
              style={{ background: ACTION_BLUE }}
              onClick={() => navigate(`/teacher/subjects/${subjectId}?tab=classwork`)}
            >
              Go to Classwork
            </button>
          </div>
        ) : (
          <div className="gradebook-shell overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-sm">
            <div className="gradebook-toolbar flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200 bg-neutral-50 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-neutral-900">Grade Book — {subjectLabel}</p>
                <p className="text-xs text-neutral-500">
                  Section: {sectionLabel} · {gradebook.students?.length ?? 0} students · Read-only
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {gradebook.sections?.length > 1 ? (
                  <select
                    className="rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-xs"
                    value={sectionId}
                    onChange={(e) => setSectionId(e.target.value)}
                  >
                    {gradebook.sections.map((sec) => (
                      <option key={sec.id} value={String(sec.id)}>
                        {sec.section_name}
                      </option>
                    ))}
                  </select>
                ) : null}
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                  onClick={handleExport}
                >
                  <i className="ti ti-file-spreadsheet" aria-hidden="true" />
                  Generate Report
                </button>
              </div>
            </div>

            <div className="gradebook-legend flex gap-0 overflow-x-auto border-b border-neutral-200">
              {(gradebook.components || []).map((comp) => (
                <div
                  key={comp.id}
                  className="flex shrink-0 items-center gap-2 border-r border-neutral-200 px-4 py-2 text-xs"
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: comp.color }} />
                  <span className="font-medium">{comp.name}</span>
                  <span className="text-neutral-500">{comp.percentage}%</span>
                </div>
              ))}
            </div>

            <GradebookTable
              components={gradebook.components}
              items={gradebook.items}
              students={gradebook.students}
              scoresMap={scoresMap}
            />
          </div>
        )}

        {criteriaConfigured && hasItems ? (
          <p className="mt-3 text-xs text-neutral-500">
            <Link to={`/teacher/subjects/${subjectId}?tab=grades`} className="text-[#185FA5] hover:underline">
              Edit grade criteria
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  )
}
