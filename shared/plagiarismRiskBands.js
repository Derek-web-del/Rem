/** Interpretation Guide bands: 0–30% Low, 31–70% Medium, 71–100% High */
export const RISK_LOW_MAX = 30
export const RISK_MEDIUM_MAX = 70

/** @param {number} score 0–100 @returns {'Low' | 'Medium' | 'High'} */
export function getRiskLevelFromScore(score) {
  const n = Number(score) || 0
  if (n <= RISK_LOW_MAX) return 'Low'
  if (n <= RISK_MEDIUM_MAX) return 'Medium'
  return 'High'
}
