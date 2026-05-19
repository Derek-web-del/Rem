import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useParams } from 'react-router-dom'
import { fetchActivityFormOptions } from '../../lib/teacherActivities.js'
import {
  combineDateAndTimeToIso,
  createTeacherQuiz,
  fetchTeacherQuiz,
  quizToApiPayload,
  splitDeadlineToDateAndTime,
  updateTeacherQuiz,
} from '../../lib/teacherQuizzes.js'
import { QUARTER_OPTIONS, emptyPart } from '../../lib/quizQuestionTypes.js'
import {
  FACULTY_MSG,
  FACULTY_TOAST_ID,
  FACULTY_ANNOUNCEMENT_TOAST_MS,
  useFacultyNotify,
} from '../../lib/facultyNotify.js'
import TeacherMainHeader from './TeacherMainHeader.jsx'
import BackButton from '../../components/BackButton.jsx'
import PasswordInput from '../../components/PasswordInput.jsx'
import { PartBlock, calcTotalPoints, inputClass, labelClass } from './TeacherQuizQuestionFields.jsx'
import { ACTION_BLUE } from './instituteChrome.js'

const FALLBACK_SUBJECTS = ['English', 'Math', 'Science', 'Filipino']
const FALLBACK_GRADES = ['Grade 7', 'Grade 8', 'Grade 9', 'Grade 10']

function partFromApi(part, index) {
  return {
    clientKey: `part-${part.id || index}`,
    part_title: part.part_title || '',
    question_type: part.question_type || 'multiple_choice',
    no_of_questions: part.no_of_questions || part.questions?.length || 1,
    order_index: part.order_index ?? index,
    questions: (part.questions || []).map((q, qi) => ({
      clientKey: `q-${q.id || qi}`,
      question_text: q.question_text || '',
      question_type: q.question_type || part.question_type,
      points: q.points ?? 1,
      order_index: q.order_index ?? qi,
      choices: q.choices || [],
      answers: q.answers || [],
    })),
    generating: false,
    structureGenerated: (part.questions || []).length > 0,
  }
}

export default function TeacherQuizForm({ mode = 'add' }) {
  const isEdit = mode === 'edit'
  const { id } = useParams()
  const navigate = useNavigate()
  const { logoutToPortal, setSidebarNavLocked } = useOutletContext() || {}
  const toast = useFacultyNotify()
  const toastRef = useRef(toast)
  toastRef.current = toast

  const [subjectOptions, setSubjectOptions] = useState(FALLBACK_SUBJECTS)
  const [gradeOptions, setGradeOptions] = useState(FALLBACK_GRADES)
  const [loading, setLoading] = useState(isEdit)
  const [submitting, setSubmitting] = useState(false)
  const [hasPassword, setHasPassword] = useState(false)
  const [passwordTouched, setPasswordTouched] = useState(false)
  const [form, setForm] = useState({
    title: '',
    activity_type: 'Quiz',
    description: '',
    instructions: '',
    duration_mins: '',
    subject: '',
    grade_level: '',
    quarter: '',
    deadline_date: '',
    deadline_time: '',
    quiz_password: '',
  })
  const [parts, setParts] = useState([emptyPart(0)])

  const totalPoints = useMemo(() => calcTotalPoints(parts), [parts])

  useEffect(() => {
    setSidebarNavLocked?.(false)
  }, [setSidebarNavLocked])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const options = await fetchActivityFormOptions()
        if (cancelled) return
        if (options.subjects.length) setSubjectOptions(options.subjects)
        if (options.gradeLevels.length) setGradeOptions(options.gradeLevels)
      } catch (e) {
        console.error('[TeacherQuizForm] options', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isEdit || !id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const quiz = await fetchTeacherQuiz(id)
        if (cancelled) return
        const { date, time } = splitDeadlineToDateAndTime(quiz.deadline)
        setForm({
          title: quiz.title || '',
          activity_type: quiz.activity_type || 'Quiz',
          description: quiz.description || '',
          instructions: quiz.instructions || '',
          duration_mins: quiz.duration_mins != null ? String(quiz.duration_mins) : '',
          subject: quiz.subject || '',
          grade_level: quiz.grade_level || '',
          quarter: quiz.quarter != null ? String(quiz.quarter) : '',
          deadline_date: date,
          deadline_time: time,
          quiz_password: '',
        })
        setHasPassword(Boolean(quiz.has_password))
        setPasswordTouched(false)
        const loadedParts = (quiz.parts || []).map(partFromApi)
        setParts(loadedParts.length ? loadedParts : [emptyPart(0)])
      } catch (e) {
        console.error('[TeacherQuizForm]', e)
        toastRef.current.error(FACULTY_MSG.quiz.updateFailed, {
          toastId: FACULTY_TOAST_ID.quizEditError,
          durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
        })
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isEdit, id])

  function patchForm(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function updatePart(index, nextPart) {
    setParts((prev) => prev.map((p, i) => (i === index ? nextPart : p)))
  }

  function addPart() {
    setParts((prev) => [...prev, emptyPart(prev.length)])
  }

  function removePart(index) {
    setParts((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)))
  }

  function validate() {
    if (!String(form.title || '').trim()) {
      toastRef.current.error('Quiz title is required.', {
        toastId: FACULTY_TOAST_ID.quizAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    if (!String(form.subject || '').trim()) {
      toastRef.current.error('Please select a Subject.', {
        toastId: FACULTY_TOAST_ID.quizAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    if (!String(form.quarter || '').trim()) {
      toastRef.current.error('Please select a Quarter.', {
        toastId: FACULTY_TOAST_ID.quizQuarterError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    const hasQuestions = parts.some((p) => (p.questions || []).length > 0)
    if (!hasQuestions) {
      toastRef.current.error('Generate question structure for at least one part.', {
        toastId: FACULTY_TOAST_ID.quizAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
      return false
    }
    return true
  }

  async function handleSubmit() {
    if (!validate()) return
    setSubmitting(true)
    try {
      const deadline = combineDateAndTimeToIso(form.deadline_date, form.deadline_time)
      const payload = quizToApiPayload(
        {
          ...form,
          deadline,
          total_points: totalPoints,
          password_touched: isEdit ? passwordTouched : true,
        },
        parts,
      )
      if (isEdit && id) {
        await updateTeacherQuiz(id, payload)
        navigate('/teacher/quizzes', { state: { quizToast: 'updated' } })
      } else {
        await createTeacherQuiz(payload)
        navigate('/teacher/quizzes', { state: { quizToast: 'created' } })
      }
    } catch (e) {
      toastRef.current.error(String(e?.message || FACULTY_MSG.quiz.createFailed), {
        toastId: isEdit ? FACULTY_TOAST_ID.quizEditError : FACULTY_TOAST_ID.quizAddError,
        durationMs: FACULTY_ANNOUNCEMENT_TOAST_MS,
      })
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = !loading && !submitting && String(form.title).trim() && String(form.subject).trim()

  return (
    <>
      <TeacherMainHeader pageTitle="Quiz Maker" onLogout={logoutToPortal} />
      <main className="flex min-h-0 flex-1 flex-col overflow-auto p-4 md:p-6">
        <div className="mb-4">
          <BackButton to="/teacher/quizzes" />
          <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">VIEW</p>
        </div>

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-neutral-900 md:text-2xl">Quiz Creation</h2>
          <button
            type="button"
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white hover:brightness-110 disabled:opacity-50"
            style={{ background: ACTION_BLUE }}
            onClick={() => void handleSubmit()}
            disabled={!canSubmit}
          >
            {submitting ? 'Saving…' : isEdit ? 'Update quiz' : 'Create quiz'}
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-neutral-500">Loading quiz…</p>
        ) : (
          <div className="space-y-6">
            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <h3 className="mb-3 text-sm font-bold uppercase tracking-wide text-neutral-700">Activity details</h3>

              {/* Row 1: Title | Activity Type | Deadline | Duration */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <label className={labelClass}>Title *</label>
                  <input
                    className={inputClass}
                    value={form.title}
                    onChange={(e) => patchForm('title', e.target.value)}
                    placeholder="e.g., Midterm Exam"
                  />
                </div>
                <div>
                  <label className={labelClass}>Activity type</label>
                  <select
                    className={inputClass}
                    value={form.activity_type}
                    onChange={(e) => patchForm('activity_type', e.target.value)}
                  >
                    <option value="Quiz">Quiz</option>
                    <option value="Exam">Exam</option>
                    <option value="Long Test">Long Test</option>
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Deadline</label>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      className={inputClass}
                      value={form.deadline_date}
                      onChange={(e) => patchForm('deadline_date', e.target.value)}
                    />
                    <input
                      type="time"
                      className={inputClass}
                      value={form.deadline_time}
                      onChange={(e) => patchForm('deadline_time', e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Duration (mins)</label>
                  <input
                    type="number"
                    min="1"
                    className={inputClass}
                    value={form.duration_mins}
                    onChange={(e) => patchForm('duration_mins', e.target.value)}
                    placeholder="e.g., 90"
                  />
                </div>
              </div>

              {/* Row 2: Subject | Quarter | Total Points | Password */}
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-2">
                  <div>
                    <label className={labelClass}>Subject *</label>
                    <select
                      className={inputClass}
                      value={form.subject}
                      onChange={(e) => patchForm('subject', e.target.value)}
                    >
                      <option value="">Select subject</option>
                      {subjectOptions.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>Grade level</label>
                    <select
                      className={inputClass}
                      value={form.grade_level}
                      onChange={(e) => patchForm('grade_level', e.target.value)}
                    >
                      <option value="">Select grade</option>
                      {gradeOptions.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Quarter *</label>
                  <select
                    className={inputClass}
                    value={form.quarter}
                    onChange={(e) => patchForm('quarter', e.target.value)}
                  >
                    <option value="">Select quarter</option>
                    {QUARTER_OPTIONS.map((q) => (
                      <option key={q} value={q}>
                        Quarter {q}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>Total points</label>
                  <input className={`${inputClass} bg-neutral-100`} readOnly value={totalPoints.toFixed(2)} />
                </div>
                <div>
                  <label className={labelClass}>Password (optional)</label>
                  <PasswordInput
                    value={form.quiz_password}
                    onChange={(e) => {
                      setPasswordTouched(true)
                      patchForm('quiz_password', e.target.value)
                    }}
                    placeholder={
                      isEdit && hasPassword
                        ? 'Keep current if blank'
                        : 'Optional'
                    }
                  />
                </div>
              </div>

              {/* Row 3: Description | Instructions */}
              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <label className={labelClass}>Description</label>
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-y`}
                    rows={4}
                    value={form.description}
                    onChange={(e) => patchForm('description', e.target.value)}
                    placeholder="Brief description..."
                  />
                </div>
                <div>
                  <label className={labelClass}>Instructions</label>
                  <textarea
                    className={`${inputClass} min-h-[100px] resize-y`}
                    rows={4}
                    value={form.instructions}
                    onChange={(e) => patchForm('instructions', e.target.value)}
                    placeholder="Detailed instructions for students..."
                  />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-sm font-bold uppercase tracking-wide text-neutral-700">Parts &amp; questions</h3>
                <button
                  type="button"
                  onClick={addPart}
                  className="rounded-lg border border-neutral-300 px-3 py-1.5 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
                >
                  + Add part
                </button>
              </div>
              <div className="space-y-4">
                {parts.map((part, index) => (
                  <PartBlock
                    key={part.clientKey}
                    part={part}
                    partIndex={index}
                    onChange={(next) => updatePart(index, next)}
                    onRemove={() => removePart(index)}
                    canRemove={parts.length > 1}
                  />
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  )
}
