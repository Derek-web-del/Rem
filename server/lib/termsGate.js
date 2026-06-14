/** Shared helpers for server-side terms enforcement */

export function isTermsExemptRequest(req) {
  const path = String(req.path || req.originalUrl || '').toLowerCase()
  return path.includes('/terms-status') || path.includes('/accept-terms')
}

export function sendTermsNotAccepted(res, portal = 'portal') {
  res.status(403).json({
    success: false,
    error: 'TERMS_NOT_ACCEPTED',
    message: `You must accept the Terms & Conditions before using the ${portal}.`,
  })
}
