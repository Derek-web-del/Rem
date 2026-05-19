/** Parse required academic quarter (1–4) from request body. */
export function parseRequiredQuarter(raw) {
  const q = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(q) || q < 1 || q > 4) return null
  return q
}
