import { STRONG_PASSWORD_REGEX } from './auth-client.js'

/** @returns {'Weak' | 'Fair' | 'Strong' | 'Very Strong'} */
export function getPasswordStrength(pw) {
  const s = String(pw || '')
  if (!s) return 'Weak'
  let score = 0
  if (s.length >= 8) score += 1
  if (s.length >= 12) score += 1
  if (/[a-z]/.test(s)) score += 1
  if (/[A-Z]/.test(s)) score += 1
  if (/\d/.test(s)) score += 1
  if (/[^A-Za-z0-9]/.test(s)) score += 1
  if (score <= 2) return 'Weak'
  if (score <= 4) return 'Fair'
  if (score <= 5) return 'Strong'
  return 'Very Strong'
}

export function passwordRequirementChecks(pw) {
  const s = String(pw || '')
  return {
    len: s.length >= 8,
    upper: /[A-Z]/.test(s),
    lower: /[a-z]/.test(s),
    num: /\d/.test(s),
    special: /[^A-Za-z0-9]/.test(s),
    strong: STRONG_PASSWORD_REGEX.test(s),
  }
}
