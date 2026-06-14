export function computePercent(score, maxScore) {
  const s = Number(score)
  const m = Number(maxScore)
  if (!Number.isFinite(s) || !Number.isFinite(m) || m <= 0) return null
  return Math.round((s / m) * 100)
}

export function formatScoreWithPercent(score, maxScore) {
  const s = Number(score)
  const m = Number(maxScore)
  if (!Number.isFinite(s)) return '—'
  const pct = computePercent(s, m)
  if (pct != null) return `${s}/${m} (${pct}%)`
  return String(s)
}

export function countGradedSubmissions(submissions) {
  if (!Array.isArray(submissions)) return { graded: 0, total: 0 }
  const total = submissions.length
  const graded = submissions.filter((sub) => {
    const status = String(sub?.status ?? '').toLowerCase()
    if (status === 'graded' || status === 'expired' || status === 'completed') return true
    return sub?.score != null && Number.isFinite(Number(sub.score))
  }).length
  return { graded, total }
}

export function displayGrade(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

export function gradeStatusFromPercent(percent, { noScoresYet = false } = {}) {
  if (noScoresYet) return { label: 'Not started', tone: 'neutral' }
  const p = displayGrade(percent)
  if (p >= 75) return { label: 'Passed', tone: 'passed' }
  if (p >= 60) return { label: 'At risk', tone: 'at_risk' }
  return { label: 'Failed', tone: 'failed' }
}

export function gradeStatusBadgeClass(tone) {
  switch (tone) {
    case 'passed':
      return 'border-emerald-200 bg-emerald-50 text-emerald-800'
    case 'at_risk':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'failed':
      return 'border-red-200 bg-red-50 text-red-800'
    default:
      return 'border-neutral-200 bg-neutral-50 text-neutral-600'
  }
}

export function submissionStatusBadgeClass(tone) {
  switch (tone) {
    case 'passed':
    case 'at_risk':
    case 'failed':
      return gradeStatusBadgeClass(tone)
    case 'pending':
      return 'border-amber-200 bg-amber-50 text-amber-800'
    case 'neutral':
      return 'border-neutral-200 bg-neutral-100 text-neutral-600'
    default:
      return gradeStatusBadgeClass(tone)
  }
}

/**
 * Assignment/activity submission status label + grade-percent tone for list badges.
 * @param {Record<string, unknown>|null|undefined} submission
 * @param {number} [totalScore=100]
 */
export function resolveSubmissionStatusBadge(submission, totalScore = 100) {
  const total = Number(totalScore) > 0 ? Number(totalScore) : 100
  const status = String(submission?.status ?? 'not_submitted').toLowerCase()
  const score = submission?.score != null ? Number(submission.score) : null
  const hasFile = Boolean(String(submission?.file_path ?? '').trim())
  const submittedAt = submission?.submitted_at ?? null

  if (status === 'expired') {
    return { label: `Score: 0/${total}`, tone: 'failed' }
  }
  if (status === 'not_submitted' && !hasFile && !submittedAt) {
    return { label: 'Not Submitted', tone: 'neutral' }
  }
  if (score != null && Number.isFinite(score) && status !== 'expired') {
    const percent = computePercent(score, total)
    const { tone } = gradeStatusFromPercent(percent)
    return { label: `Score: ${score}/${total}`, tone }
  }
  if (status === 'submitted' || submittedAt || hasFile) {
    return { label: 'Pending', tone: 'pending' }
  }
  return { label: 'Not Submitted', tone: 'neutral' }
}

export function isGradedStatusTone(tone) {
  return tone === 'passed' || tone === 'at_risk' || tone === 'failed'
}

export function formatGradeAvg(value) {
  return `${displayGrade(value)}%`
}

export function formatSubmittedAt(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
}
