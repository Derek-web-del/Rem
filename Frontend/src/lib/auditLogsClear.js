import { apiUrl } from './lmsStateStorage.js'

async function parseJson(res) {
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(String(data?.message || data?.error || `Request failed (${res.status}).`))
  }
  return data
}

/**
 * @param {{ clearType: string, beforeDate?: string, fromDate?: string, toDate?: string }} params
 * @returns {Promise<{ count: number, auditLogs: number, lmsActivityLogs: number }>}
 */
export async function fetchAuditClearPreview(params) {
  const q = new URLSearchParams()
  q.set('clearType', params.clearType)
  if (params.beforeDate) q.set('beforeDate', params.beforeDate)
  if (params.fromDate) q.set('fromDate', params.fromDate)
  if (params.toDate) q.set('toDate', params.toDate)
  const res = await fetch(apiUrl(`/api/logs/audit/clear-preview?${q.toString()}`), {
    credentials: 'include',
  })
  const data = await parseJson(res)
  const auditLogs = Number(data?.auditLogs ?? 0)
  const lmsActivityLogs = Number(data?.lmsActivityLogs ?? 0)
  const count = Number(data?.count ?? auditLogs + lmsActivityLogs)
  return { count, auditLogs, lmsActivityLogs }
}

/**
 * @param {{ clearType: string, beforeDate?: string, fromDate?: string, toDate?: string }} body
 */
export async function clearAuditLogs(body) {
  const res = await fetch(apiUrl('/api/logs/audit/clear'), {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  return parseJson(res)
}

/** @param {{ count: number, auditLogs: number, lmsActivityLogs: number }} preview */
export function formatClearPreviewBreakdown(preview) {
  const auditLogs = Number(preview?.auditLogs ?? 0)
  const lmsActivityLogs = Number(preview?.lmsActivityLogs ?? 0)
  const count = Number(preview?.count ?? auditLogs + lmsActivityLogs)
  if (auditLogs > 0 && lmsActivityLogs > 0) {
    return `${auditLogs.toLocaleString()} audit_logs + ${lmsActivityLogs.toLocaleString()} lms_activity_logs = ${count.toLocaleString()} total`
  }
  if (lmsActivityLogs > 0) {
    return `${lmsActivityLogs.toLocaleString()} lms_activity_logs`
  }
  if (auditLogs > 0) {
    return `${auditLogs.toLocaleString()} audit_logs`
  }
  return '0 entries'
}
