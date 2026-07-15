/** Institute admin account email (Better Auth user + OTP delivery). */
export const INSTITUTE_ADMIN_EMAIL = 'olympus.grp123@gmail.com'

/** Display name for institute admin in UI and audit logs. */
export const INSTITUTE_ADMIN_DISPLAY_NAME = 'Aldrich Juachon'

const LEGACY_ADMIN_NAME_PATTERN = /^derek(\s+john)?\s+bantad$/i

/** Map seed/auth admin name to the institute admin display name in UI. */
export function normalizeInstituteAdminDisplayName(raw, email = '') {
  const em = String(email || '').trim().toLowerCase()
  if (em && em === INSTITUTE_ADMIN_EMAIL.toLowerCase()) return INSTITUTE_ADMIN_DISPLAY_NAME

  const name = String(raw || '').trim()
  if (!name) return name
  if (LEGACY_ADMIN_NAME_PATTERN.test(name)) return INSTITUTE_ADMIN_DISPLAY_NAME
  return name
}
