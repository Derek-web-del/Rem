import { listSchedulesForSubject, formatSchedulesSummary } from './subjectSchedulesDb.js'

export async function withSubjectSchedules(pool, row) {
  if (!row || row.id == null) return row
  const schedules = await listSchedulesForSubject(pool, row.id)
  const schedule_label = formatSchedulesSummary(schedules)
  return {
    ...row,
    schedules,
    schedule: schedules[0] || null,
    schedule_label,
  }
}

export async function withSubjectSchedulesList(pool, rows) {
  const list = Array.isArray(rows) ? rows : []
  const out = []
  for (const row of list) {
    out.push(await withSubjectSchedules(pool, row))
  }
  return out
}
