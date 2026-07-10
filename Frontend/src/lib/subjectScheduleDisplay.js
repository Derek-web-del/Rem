export const WEEKDAY_OPTIONS = [
  { value: '1', label: 'Monday', short: 'Mon' },
  { value: '2', label: 'Tuesday', short: 'Tue' },
  { value: '3', label: 'Wednesday', short: 'Wed' },
  { value: '4', label: 'Thursday', short: 'Thu' },
  { value: '5', label: 'Friday', short: 'Fri' },
]

const DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function normalizeScheduleDays(raw) {
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
    if (Number.isFinite(day) && day >= 1 && day <= 5) set.add(String(day))
  }
  return [...set].sort((a, b) => Number(a) - Number(b))
}

export function scheduleDaysFromSubject(subject) {
  const list = Array.isArray(subject?.schedules)
    ? subject.schedules
    : subject?.schedule
      ? [subject.schedule]
      : []
  const fromRows = list.map((slot) => String(slot?.day_of_week ?? '').trim()).filter((d) => /^[1-5]$/.test(d))
  if (fromRows.length) return normalizeScheduleDays(fromRows)
  const legacy = String(subject?.scheduleDayOfWeek ?? subject?.schedule?.day_of_week ?? '').trim()
  return legacy && /^[1-5]$/.test(legacy) ? [legacy] : []
}

function formatWeekdayRange(days) {
  const nums = days.map(Number).filter((d) => d >= 1 && d <= 5).sort((a, b) => a - b)
  if (!nums.length) return ''
  if (nums.length === 5 && nums.every((d, i) => d === i + 1)) return 'Mon–Fri'
  if (nums.length === 1) return DAY_LABELS[nums[0]] || DAY_SHORT[nums[0]] || `Day ${nums[0]}`
  return nums.map((d) => DAY_SHORT[d] || DAY_LABELS[d]).join(', ')
}

/** Human-readable schedule for cards and detail panels. */
export function formatSubjectScheduleLabel(subject) {
  const preset = String(subject?.schedule_label ?? '').trim()
  if (preset) return preset

  const list = Array.isArray(subject?.schedules)
    ? subject.schedules.filter(Boolean)
    : subject?.schedule
      ? [subject.schedule]
      : []
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
      const dayLabel = formatWeekdayRange(group.days)
      const time = group.start && group.end ? `${group.start}–${group.end}` : group.start || group.end || ''
      return [dayLabel, time, group.room].filter(Boolean).join(' · ')
    })
    .filter(Boolean)
    .join('; ')
}

export function scheduleTimesFromSubject(subject) {
  const list = Array.isArray(subject?.schedules)
    ? subject.schedules
    : subject?.schedule
      ? [subject.schedule]
      : []
  const first = list[0] || {}
  return {
    scheduleStartTime: String(subject?.scheduleStartTime ?? first.start_time ?? '08:00').trim().slice(0, 5) || '08:00',
    scheduleEndTime: String(subject?.scheduleEndTime ?? first.end_time ?? '09:00').trim().slice(0, 5) || '09:00',
    scheduleRoom: String(subject?.scheduleRoom ?? first.room ?? '').trim(),
  }
}
