import { insertAuditLogRecord } from './auditLogsLedger.js'
import { STUDENT_PORTAL_MODULES } from '../../shared/auditPortalModules.js'

/** Record student LOGIN in audit_logs (called from auth hook). */
export async function recordStudentLoginAudit(user, ipAddress) {
  if (String(user?.role || '').trim().toLowerCase() !== 'student') return
  const studentName = String(user.name || user.email || '').trim()
  try {
    await insertAuditLogRecord(
      'LOGIN',
      {
        user_id: String(user.id),
        userId: String(user.id),
        role: 'student',
        action: 'LOGIN',
        description: 'Student logged in',
        ip_address: String(ipAddress || '').trim(),
        userEmail: String(user.email || '').trim().toLowerCase(),
        userName: studentName,
        targetName: studentName,
        target_label: studentName,
        module: STUDENT_PORTAL_MODULES.DASHBOARD,
      },
      {
        module: STUDENT_PORTAL_MODULES.DASHBOARD,
        performed_by: String(user.id),
        performed_by_name: studentName,
        target_label: studentName,
      },
    )
  } catch (err) {
    console.warn('[student login audit]', err?.message || err)
  }
}
