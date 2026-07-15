import { normalizeWeekdayDays } from './subjectSchedulesDb.js'

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** @param {string} t HH:MM or HH:MM:SS */
export function normalizeTimeValue(t) {
  const s = String(t || '').trim()
  if (!s) return ''
  return s.length >= 5 ? s.slice(0, 5) : s
}

/** Same weekday + overlapping time ranges (exclusive end). */
export function timeRangesOverlap(startA, endA, startB, endB) {
  const a0 = normalizeTimeValue(startA)
  const a1 = normalizeTimeValue(endA)
  const b0 = normalizeTimeValue(startB)
  const b1 = normalizeTimeValue(endB)
  if (!a0 || !a1 || !b0 || !b1) return false
  return a0 < b1 && b0 < a1
}

/** @param {{ days?: unknown, start_time?: string, end_time?: string }} spec */
export function expandScheduleSpec(spec) {
  const days = normalizeWeekdayDays(spec?.days ?? spec?.day_of_week)
  const start_time = normalizeTimeValue(spec?.start_time)
  const end_time = normalizeTimeValue(spec?.end_time)
  if (!days.length || !start_time || !end_time) return []
  return days.map((day_of_week) => ({ day_of_week, start_time, end_time }))
}

function dayLabel(day) {
  const d = Number(day)
  return DAY_SHORT[d] || DAY_LABELS[d] || `Day ${d}`
}

function formatConflictRow(row) {
  const day = dayLabel(row.day_of_week)
  const start = normalizeTimeValue(row.start_time)
  const end = normalizeTimeValue(row.end_time)
  const time = start && end ? `${start}–${end}` : start || end || ''
  return {
    subject_id: row.subject_id != null ? Number(row.subject_id) : null,
    subject_code: String(row.subject_code || '').trim(),
    subject_name: String(row.subject_name || '').trim(),
    day_of_week: Number(row.day_of_week),
    day_label: day,
    start_time: start,
    end_time: end,
    time,
  }
}

function findSlotConflicts(proposedSlots, existingSlots, { subjectId, subjectCode, subjectName }) {
  const conflicts = []
  for (const slot of proposedSlots) {
    for (const ex of existingSlots) {
      if (Number(ex.subject_id) === Number(subjectId)) continue
      if (Number(ex.day_of_week) !== Number(slot.day_of_week)) continue
      if (!timeRangesOverlap(slot.start_time, slot.end_time, ex.start_time, ex.end_time)) continue
      conflicts.push(
        formatConflictRow({
          subject_id: ex.subject_id,
          subject_code: ex.subject_code,
          subject_name: ex.subject_name,
          day_of_week: ex.day_of_week,
          start_time: ex.start_time,
          end_time: ex.end_time,
        }),
      )
    }
  }
  return conflicts
}

async function loadFacultyScheduleSlots(pool, facultyId, excludeSubjectId) {
  if (!facultyId) return []
  const { rows } = await pool.query(
    `
      SELECT s.id AS subject_id, s.subject_code, s.subject_name,
             ss.day_of_week, ss.start_time, ss.end_time
      FROM public.subjects s
      JOIN public.subject_schedules ss ON ss.subject_id = s.id
      WHERE s.archived_at IS NULL
        AND s.faculty_id::text = $1::text
        AND ($2::int IS NULL OR s.id <> $2)
    `,
    [String(facultyId), excludeSubjectId ?? null],
  )
  return rows || []
}

async function loadGradeScheduleSlots(pool, gradeLevel, semester, excludeSubjectId) {
  const grade = String(gradeLevel || '').trim()
  if (!grade) return []
  const sem = Number(semester)
  const { rows } = await pool.query(
    `
      SELECT s.id AS subject_id, s.subject_code, s.subject_name,
             ss.day_of_week, ss.start_time, ss.end_time
      FROM public.subjects s
      JOIN public.subject_schedules ss ON ss.subject_id = s.id
      WHERE s.archived_at IS NULL
        AND lower(trim(replace(coalesce(s.grade_level, ''), '  ', ' '))) =
            lower(trim(replace($1, '  ', ' ')))
        AND s.semester = $2
        AND ($3::int IS NULL OR s.id <> $3)
    `,
    [grade, sem, excludeSubjectId ?? null],
  )
  return rows || []
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ subjectId?: number | null, facultyId?: string | null, gradeLevel?: string, semester?: number, scheduleSpec?: object }} opts
 */
export async function detectFacultyConflicts(pool, opts) {
  const proposed = expandScheduleSpec(opts.scheduleSpec || {})
  if (!proposed.length || !opts.facultyId) return []
  const existing = await loadFacultyScheduleSlots(pool, opts.facultyId, opts.subjectId ?? null)
  return findSlotConflicts(proposed, existing, opts)
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ subjectId?: number | null, gradeLevel?: string, semester?: number, scheduleSpec?: object }} opts
 */
export async function detectGradeConflicts(pool, opts) {
  const proposed = expandScheduleSpec(opts.scheduleSpec || {})
  if (!proposed.length) return []
  const existing = await loadGradeScheduleSlots(pool, opts.gradeLevel, opts.semester, opts.subjectId ?? null)
  return findSlotConflicts(proposed, existing, opts)
}

/**
 * @param {import('pg').Pool} pool
 * @param {{ subjectId?: number | null, facultyId?: string | null, gradeLevel?: string, semester?: number, scheduleSpec?: object }} opts
 */
export async function assertNoScheduleConflicts(pool, opts) {
  const faculty_conflicts = await detectFacultyConflicts(pool, opts)
  const student_conflicts = await detectGradeConflicts(pool, opts)
  if (!faculty_conflicts.length && !student_conflicts.length) return { ok: true }

  const err = new Error('Schedule conflict detected.')
  err.code = 'SCHEDULE_CONFLICT'
  err.faculty_conflicts = faculty_conflicts
  err.student_conflicts = student_conflicts
  throw err
}

/**
 * Greedily filter subjects that would overlap on the student timetable.
 * @param {Array<{ id?: number, subject_code?: string, schedules?: object[] }>} subjects
 */
export function filterSubjectsWithoutScheduleConflicts(subjects) {
  const list = [...(subjects || [])].sort((a, b) => {
    const codeA = String(a?.subject_code || '').trim()
    const codeB = String(b?.subject_code || '').trim()
    if (codeA !== codeB) return codeA.localeCompare(codeB)
    return Number(a?.id || 0) - Number(b?.id || 0)
  })

  const kept = []
  const keptSlots = []

  for (const subject of list) {
    const schedules = Array.isArray(subject.schedules) ? subject.schedules : []
    const slots = schedules.map((s) => ({
      day_of_week: Number(s.day_of_week),
      start_time: normalizeTimeValue(s.start_time),
      end_time: normalizeTimeValue(s.end_time),
    }))

    let conflicts = false
    for (const slot of slots) {
      for (const keptSlot of keptSlots) {
        if (Number(slot.day_of_week) !== Number(keptSlot.day_of_week)) continue
        if (timeRangesOverlap(slot.start_time, slot.end_time, keptSlot.start_time, keptSlot.end_time)) {
          conflicts = true
          break
        }
      }
      if (conflicts) break
    }

    if (!conflicts) {
      kept.push(subject)
      keptSlots.push(...slots)
    }
  }

  return kept
}

export function formatScheduleConflictMessage(facultyConflicts = [], studentConflicts = []) {
  const lines = []
  for (const c of facultyConflicts) {
    lines.push(
      `Faculty is already teaching ${c.subject_code || c.subject_name || 'another subject'} on ${c.day_label} ${c.time}.`,
    )
  }
  for (const c of studentConflicts) {
    lines.push(
      `Grade schedule overlaps with ${c.subject_code || c.subject_name || 'another subject'} on ${c.day_label} ${c.time}.`,
    )
  }
  return lines.join(' ')
}
