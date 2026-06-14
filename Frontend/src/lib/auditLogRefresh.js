/** Dispatched after admin saves student/faculty account changes so Audit Logs refresh immediately. */
export const AUDIT_LOGS_REFRESH_EVENT = 'lenlearn:audit-logs-refresh'

export function dispatchAuditLogsRefresh(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(AUDIT_LOGS_REFRESH_EVENT, { detail }))
}

/** Dispatched after admin restores a .lnbak so institute dashboards reload PostgreSQL roster. */
export const BACKUP_RESTORED_EVENT = 'lenlearn:backup-restored'

export function dispatchBackupRestored(detail = {}) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(BACKUP_RESTORED_EVENT, { detail }))
}
