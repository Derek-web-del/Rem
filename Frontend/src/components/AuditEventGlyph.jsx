/** Distinct SVG icons per audit event type (Monitoring Records). */

import { normalizeEventTokens, resolveAuditEventIconKey } from '../lib/auditEventIcons.js'

export { resolveAuditEventIconKey }

function SvgGlyph({ className, children }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
      {children}
    </svg>
  )
}

function BackupIcon({ cn, activityUpper }) {
  return (
    <SvgGlyph className={`${cn} text-sky-800`}>
      <ellipse cx="12" cy="5" rx="9" ry="3" />
      <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
      <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      {activityUpper === 'BACKUP_RESTORED' ? (
        <path d="M12 11v6M9 14l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
      ) : activityUpper === 'BACKUP_DELETED' ? (
        <path d="M9 14h6" strokeLinecap="round" />
      ) : (
        <path d="M12 11v5M9 14h6" strokeLinecap="round" />
      )}
    </SvgGlyph>
  )
}

function IconByKey({ iconKey, cn, activityUpper }) {
  switch (iconKey) {
    case 'session_started':
      return (
        <SvgGlyph className={`${cn} text-blue-700`}>
          <rect x="3" y="11" width="18" height="10" rx="2" strokeLinejoin="round" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4M12 15v2" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'signed_out':
      return (
        <SvgGlyph className={cn}>
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'signed_in':
      return (
        <SvgGlyph className={`${cn} text-emerald-700`}>
          <path d="M15 3h4v4M10 14 21 3" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M21 14v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h7" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'sign_in_failed':
      return (
        <SvgGlyph className={`${cn} text-amber-800`}>
          <path d="M10.3 3.6h3.4L21 20H3L10.3 3.6Z" strokeLinejoin="round" />
          <path d="M12 9v4M12 16h.01" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'account_locked':
      return (
        <SvgGlyph className={`${cn} text-red-600`}>
          <rect x="5" y="11" width="14" height="10" rx="2" strokeLinejoin="round" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" strokeLinecap="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
        </SvgGlyph>
      )
    case 'session_revoked':
      return (
        <SvgGlyph className={cn}>
          <rect x="3" y="11" width="18" height="10" rx="2" strokeLinejoin="round" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1M17 14l-5 5M12 19l5-5" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'terms_accepted':
      return (
        <SvgGlyph className={`${cn} text-emerald-700`}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
          <path d="M14 2v6h6M9 15l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'quiz_submitted':
      return (
        <SvgGlyph className={cn}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinejoin="round" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <path d="M9 14l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'quiz_created':
      return (
        <SvgGlyph className={cn}>
          <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" strokeLinejoin="round" />
          <path d="M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2z" />
          <path d="M12 11v6M9 14h6" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'password_changed':
      return (
        <SvgGlyph className={cn}>
          <path d="M7 11V8a5 5 0 0 1 10 0v3M6 11h12v10H6V11Z" strokeLinejoin="round" />
          <circle cx="12" cy="16" r="1" fill="currentColor" stroke="none" />
        </SvgGlyph>
      )
    case 'account_changed':
      return (
        <SvgGlyph className={`${cn} text-amber-800`}>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'profile_updated':
      return (
        <SvgGlyph className={cn}>
          <path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" />
          <path d="M19 21v-1a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v1M12 11V3M9 6h6" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'user_created':
      return (
        <SvgGlyph className={cn}>
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" strokeLinecap="round" />
          <path d="M19 8v6M22 11h-6" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'assignment_submitted':
      return (
        <SvgGlyph className={cn}>
          <path d="M22 12h-4l-3 9L9 3l-3 9H2" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'announcement':
      return (
        <SvgGlyph className={cn}>
          <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5Z" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'backup':
      return <BackupIcon cn={cn} activityUpper={activityUpper} />
    case 'security':
      return (
        <SvgGlyph className={`${cn} text-amber-700`}>
          <path d="M12 3l8 4v5c0 5-3.5 9-8 10-4.5-1-8-5-8-10V7l8-4Z" strokeLinejoin="round" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'file':
      return (
        <SvgGlyph className={cn}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" strokeLinejoin="round" />
          <path d="M14 2v6h6M12 18v-6M9 15h6" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'two_factor':
      return (
        <SvgGlyph className={cn}>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M12 15v2M9 11V7a3 3 0 0 1 6 0v4" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'email':
      return (
        <SvgGlyph className={cn}>
          <path d="M4 6h16v12H4V6Z" strokeLinejoin="round" />
          <path d="m22 7-10 7L2 7" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    case 'user_blocked':
      return (
        <SvgGlyph className={`${cn} text-red-600`}>
          <circle cx="12" cy="12" r="10" />
          <path d="M4.9 4.9l14.2 14.2" strokeLinecap="round" />
        </SvgGlyph>
      )
    case 'organization':
      return (
        <SvgGlyph className={cn}>
          <path d="M3 21h18M6 21V10l6-4 6 4v11M9 21v-4h6v4" strokeLinecap="round" strokeLinejoin="round" />
        </SvgGlyph>
      )
    default:
      return (
        <SvgGlyph className={cn}>
          <circle cx="12" cy="12" r="10" />
          <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
        </SvgGlyph>
      )
  }
}

/** @param {{ e?: Record<string, unknown> }} props */
export default function AuditEventGlyph({ e }) {
  const cn = 'h-5 w-5 shrink-0 text-neutral-600'
  const { activityUpper } = normalizeEventTokens(e)
  const iconKey = resolveAuditEventIconKey(e)
  return <IconByKey iconKey={iconKey} cn={cn} activityUpper={activityUpper} />
}
