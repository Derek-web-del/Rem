/** Shown when admin changes are not persisted through audited server APIs. */
export default function AdminAuditBanner({ persistenceMode }) {
  if (persistenceMode === 'server' || persistenceMode === 'loading') return null

  return (
    <div
      className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
      role="status"
    >
      Changes in this mode are saved locally only and are <strong>not recorded in Audit Logs</strong>.
      Connect to the server to save changes and keep audit records.
    </div>
  )
}
