/** Parse required academic semester (1–3) from request body. */
export function parseRequiredSemester(raw) {
  const q = Number.parseInt(String(raw ?? '').trim(), 10)
  if (!Number.isFinite(q) || q < 1 || q > 3) return null
  return q
}
