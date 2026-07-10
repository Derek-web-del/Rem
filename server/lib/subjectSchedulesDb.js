const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export const WEEKDAY_NUMBERS = [1, 2, 3, 4, 5]

/** Normalize schedule days to unique Mon–Fri numbers (1–5). */
export function normalizeWeekdayDays(raw) {
  const items = Array.isArray(raw)
    ? raw
    : raw == null || raw === ''
      ? []
      : String(raw)
          .split(/[,;\s]+/)
          .map((part) => part.trim())
          .filter(Boolean)

  const set = new Set()
  for (const item of items) {
    const day = Number(item)
    if (Number.isFinite(day) && day >= 1 && day <= 5) set.add(day)
  }
  return [...set].sort((a, b) => a - b)
}

function formatWeekdayRange(days) {
  if (!days.length) return ''
  if (days.length === 5 && days.every((d, i) => d === i + 1)) return 'Mon–Fri'
  if (days.length === 1) return DAY_LABELS[days[0]] || DAY_SHORT[days[0]] || `Day ${days[0]}`
  return days.map((d) => DAY_SHORT[d] || DAY_LABELS[d] || `Day ${d}`).join(', ')
}

export function formatSchedulesSummary(schedules) {
  const list = Array.isArray(schedules) ? schedules.filter(Boolean) : []
  if (!list.length) return ''

  const groups = new Map()
  for (const slot of list) {
    const start = String(slot.start_time ?? '').trim().slice(0, 5)
    const end = String(slot.end_time ?? '').trim().slice(0, 5)
    const room = String(slot.room ?? '').trim()
    const key = `${start}|${end}|${room}`
    if (!groups.has(key)) groups.set(key, { start, end, room, days: [] })
    groups.get(key).days.push(Number(slot.day_of_week))
  }

  return [...groups.values()]
    .map((group) => {
      const days = normalizeWeekdayDays(group.days)
      const dayLabel = formatWeekdayRange(days)
      const time = group.start && group.end ? `${group.start}–${group.end}` : group.start || group.end || ''
      return [dayLabel, time, group.room].filter(Boolean).join(' · ')
    })
    .filter(Boolean)
    .join('; ')
}

export function formatScheduleRow(row) {
  if (!row) return null
  const day = Number(row.day_of_week)
  const start = String(row.start_time || '').slice(0, 5)
  const end = String(row.end_time || '').slice(0, 5)
  return {
    id: row.id != null ? Number(row.id) : null,
    subject_id: row.subject_id != null ? Number(row.subject_id) : null,
    day_of_week: day,
    day_label: DAY_LABELS[day] || `Day ${day}`,
    start_time: start,
    end_time: end,
    room: String(row.room || '').trim() || null,
    label: `${DAY_LABELS[day] || 'Day'} ${start}–${end}${row.room ? ` · ${row.room}` : ''}`,
  }
}

export async function ensureSubjectSchedulesSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS public.subject_schedules (
      id BIGSERIAL PRIMARY KEY,
      subject_id INT NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
      day_of_week SMALLINT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      room VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      CONSTRAINT subject_schedules_time_order CHECK (end_time > start_time)
    )
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subject_schedules_subject_id
    ON public.subject_schedules (subject_id)
  `)
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_subject_schedules_unique_slot
    ON public.subject_schedules (subject_id, day_of_week, start_time)
  `)
}

export async function ensureSubjectsCurriculumGuideColumn(pool) {
  await pool.query(`
    ALTER TABLE public.subjects
    ADD COLUMN IF NOT EXISTS curriculum_guide_id VARCHAR(64)
  `)
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_subjects_curriculum_guide_id
    ON public.subjects (curriculum_guide_id)
    WHERE curriculum_guide_id IS NOT NULL
  `)
}

export async function listSchedulesForSubject(pool, subjectId) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return []
  const { rows } = await pool.query(
    `
      SELECT id, subject_id, day_of_week, start_time, end_time, room, created_at
      FROM public.subject_schedules
      WHERE subject_id = $1
      ORDER BY day_of_week ASC, start_time ASC, id ASC
    `,
    [sid],
  )
  return (rows || []).map(formatScheduleRow).filter(Boolean)
}

/** Replace all weekday schedules for a subject (Mon–Fri only, same time/room per day). */
export async function replaceSubjectWeekdaySchedules(pool, subjectId, spec) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return []
  const days = normalizeWeekdayDays(spec?.days ?? spec?.day_of_week)
  const start = String(spec?.start_time || '').trim()
  const end = String(spec?.end_time || '').trim()
  const room = String(spec?.room || '').trim() || null

  await pool.query(`DELETE FROM public.subject_schedules WHERE subject_id = $1`, [sid])
  if (!days.length || !start || !end) return []
  if (start >= end) {
    const err = new Error('Class end time must be after the start time.')
    err.code = '23514'
    throw err
  }

  const inserted = []
  for (const day of days) {
    const { rows } = await pool.query(
      `
        INSERT INTO public.subject_schedules (subject_id, day_of_week, start_time, end_time, room)
        VALUES ($1, $2, $3::time, $4::time, $5)
        RETURNING id, subject_id, day_of_week, start_time, end_time, room, created_at
      `,
      [sid, day, start, end, room],
    )
    const formatted = formatScheduleRow(rows?.[0])
    if (formatted) inserted.push(formatted)
  }
  return inserted
}

/** @deprecated Use replaceSubjectWeekdaySchedules — kept for single-slot callers. */
export async function upsertPrimarySubjectSchedule(pool, subjectId, schedule) {
  const sid = Number(subjectId)
  if (!Number.isFinite(sid) || sid <= 0) return null
  if (!schedule) {
    await pool.query(`DELETE FROM public.subject_schedules WHERE subject_id = $1`, [sid])
    return null
  }
  const rows = await replaceSubjectWeekdaySchedules(pool, sid, schedule)
  return rows[0] || null
}

export async function seedDemoSubjectSchedules(pool) {
  await pool.query(`
    INSERT INTO public.subject_schedules (subject_id, day_of_week, start_time, end_time, room)
    SELECT s.id, v.day_of_week, v.start_time::time, v.end_time::time, v.room
    FROM (
      SELECT id, row_number() OVER (ORDER BY id) AS rn
      FROM public.subjects
      WHERE archived_at IS NULL
      ORDER BY id
      LIMIT 5
    ) s
    JOIN (
      VALUES
        (1, 1, '08:00', '09:00', 'Room 201'),
        (2, 2, '09:00', '10:00', 'Room 202'),
        (3, 3, '10:00', '11:00', 'Room 203'),
        (4, 4, '13:00', '14:00', 'Room 204'),
        (5, 5, '14:00', '15:00', 'Room 205')
    ) AS v(rn, day_of_week, start_time, end_time, room) ON v.rn = s.rn
    WHERE NOT EXISTS (
      SELECT 1 FROM public.subject_schedules ss WHERE ss.subject_id = s.id
    )
  `)
}

export { DAY_LABELS }
