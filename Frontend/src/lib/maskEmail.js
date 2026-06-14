/**
 * Mask an email for display on the OTP screen (e.g. teacher@school.edu → t***@school.edu).
 * @param {string} email
 * @returns {string}
 */
export function maskEmail(email) {
  const trimmed = String(email || '').trim()
  if (!trimmed.includes('@')) return trimmed || ''

  const [local, domain] = trimmed.split('@')
  if (!local || !domain) return trimmed

  const visible = local.length <= 1 ? local : `${local[0]}***`
  return `${visible}@${domain}`
}
