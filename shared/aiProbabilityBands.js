/** Interpretation Guide bands for AI-generated content detection */
export const AI_HUMAN_MAX = 30
export const AI_MIXED_MIN = 31
export const AI_LIKELY_MIN = 70

/** @param {number|null|undefined} score 0–100 @returns {'Likely Human' | 'Mixed' | 'Likely AI-generated' | 'Unknown'} */
export function getAiVerdictFromScore(score) {
  if (score == null || Number.isNaN(Number(score))) return 'Unknown'
  const n = Number(score)
  if (n >= AI_LIKELY_MIN) return 'Likely AI-generated'
  if (n >= AI_MIXED_MIN) return 'Mixed'
  return 'Likely Human'
}

export function formatAiProbabilityRange(min, max) {
  if (min == null && max == null) return '—'
  if (max == null || max >= 100) return `${min}–100%`
  return `${min}–${max}%`
}

export const AI_INTERPRETATION_GUIDE = [
  {
    range: formatAiProbabilityRange(0, AI_HUMAN_MAX),
    variant: 'human',
    title: 'Likely human',
    body: 'Natural variation in sentence length, vocabulary, and tone. Low likelihood of AI generation or heavy AI rewriting.',
  },
  {
    range: formatAiProbabilityRange(AI_MIXED_MIN, AI_LIKELY_MIN - 1),
    variant: 'mixed',
    title: 'Mixed / AI-assisted',
    body: 'Some AI-like patterns detected. The text may be partially AI-assisted, lightly edited AI output, or formal human writing. Review flagged sentences before concluding.',
  },
  {
    range: formatAiProbabilityRange(AI_LIKELY_MIN, 100),
    variant: 'ai',
    title: 'Likely AI-generated',
    body: 'Strong uniform structure, discourse markers, and flow patterns typical of ChatGPT, Gemini, Claude, and similar tools. Treat as a high-priority review signal—not automatic proof of misconduct.',
  },
  {
    range: '—',
    variant: 'human',
    title: 'Unknown',
    body: 'Insufficient text (under 50 characters) to estimate AI probability reliably.',
  },
]
