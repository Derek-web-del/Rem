/**
 * Maps Audit Logs dropdown labels to unified filter tokens (`auth:…` / `lms:…`).
 * Kept outside page components so Vite React Fast Refresh can hot-reload UI safely.
 *
 * @param {Array<{ id: string, label: string }>} authDropdown
 * @param {Array<{ id: string, label: string }>} lmsDropdown
 */
export function buildAuditEventParamMap(authDropdown, lmsDropdown) {
  return Object.fromEntries([
    ...(authDropdown || []).map((it) => [it.label, it.id ? `auth:${it.id}` : '']),
    ...(lmsDropdown || []).map((it) => [it.label, `lms:${it.id}`]),
  ])
}
