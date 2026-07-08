import { NavLink } from 'react-router-dom'
import Header from '../components/Header.jsx'
import OfflineBanner from '../components/OfflineBanner.jsx'
import PortalSidebarShell from '../components/PortalSidebarShell.jsx'
import { AdminAccessBadge } from '../components/PortalAccessBadge.jsx'
import { authClient } from '../lib/auth-client.js'
import { useSidebarCollapsed, SIDEBAR_COLLAPSED_KEYS } from '../hooks/useSidebarCollapsed.js'
import { NAV_ID_TO_PATH } from '../lib/adminNavRoutes.js'

const adminNavItems = [
  { label: 'Dashboard', to: NAV_ID_TO_PATH.dashboard, icon: 'ti-layout-dashboard' },
  { label: 'Curriculum', to: NAV_ID_TO_PATH.curriculum, icon: 'ti-book' },
  { label: 'Section', to: NAV_ID_TO_PATH.section, icon: 'ti-layers-intersect' },
  { label: 'Students', to: NAV_ID_TO_PATH.students, icon: 'ti-users' },
  { label: 'Faculties', to: NAV_ID_TO_PATH.faculties, icon: 'ti-user' },
  { label: 'Subjects', to: NAV_ID_TO_PATH.subjects, icon: 'ti-file-text' },
  { label: 'Announcements', to: NAV_ID_TO_PATH.updates, icon: 'ti-bell' },
  { label: 'Audit Logs', to: NAV_ID_TO_PATH.monitoring, icon: 'ti-activity' },
  { label: 'Data Backup', to: NAV_ID_TO_PATH.backup, icon: 'ti-database-export' },
  { label: 'Archive Vault', to: NAV_ID_TO_PATH.archive, icon: 'ti-archive' },
]

export default function AdminLayout({ onLogout, children }) {
  const { collapsed, toggleCollapsed } = useSidebarCollapsed(SIDEBAR_COLLAPSED_KEYS.admin)
  const { data: sessionData } = authClient.useSession()
  const adminName = String(sessionData?.user?.name || sessionData?.user?.email || '').trim()

  const baseLinkClass =
    'flex items-center rounded-lg text-sm font-medium transition'
  const linkPadding = collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'

  const footerLinkClass =
    'flex w-full items-center rounded-lg text-sm font-medium text-white/90 transition'
  const footerPadding = collapsed ? 'justify-center px-2 py-2.5' : 'justify-center gap-3 px-3 py-2.5'

  return (
    <div
      className="flex h-svh min-h-0 overflow-hidden font-[Inter,system-ui,sans-serif]"
      style={{ fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <PortalSidebarShell
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        header={<Header collapsed={collapsed} />}
        footer={
          <div className="shrink-0 border-t border-white/15 px-2 py-4 text-center text-white/85">
            {!collapsed ? (
              <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Legal center</p>
            ) : null}
            <NavLink
              to="/admin/terms"
              title="Terms & Conditions"
              aria-label="Terms & Conditions"
              className={({ isActive }) =>
                `${footerLinkClass} ${footerPadding} ${collapsed ? 'mt-0.5' : 'mt-2'} ${
                  isActive ? 'bg-white/20 text-white shadow-inner' : 'hover:bg-white/10'
                }`
              }
            >
              <i
                className="ti ti-file-description"
                style={{ fontSize: '18px', minWidth: '20px' }}
                aria-hidden="true"
              />
              {!collapsed ? <span>Terms &amp; Conditions</span> : null}
            </NavLink>
            <button
              type="button"
              onClick={onLogout}
              title="Logout"
              aria-label="Logout"
              className={`mt-0.5 ${footerLinkClass} ${footerPadding} hover:bg-white/10`}
            >
              <i className="ti ti-logout" style={{ fontSize: '18px', minWidth: '20px' }} aria-hidden="true" />
              {!collapsed ? <span>Logout</span> : null}
            </button>
            {!collapsed ? (
              <p className="mt-3 px-1 text-xs leading-relaxed text-white/60">
                © {new Date().getFullYear()} LENLEARN LMS. ALL RIGHTS RESERVED.
              </p>
            ) : null}
          </div>
        }
      >
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2">
          {adminNavItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === NAV_ID_TO_PATH.dashboard}
              title={item.label}
              aria-label={item.label}
              className={({ isActive }) =>
                `${baseLinkClass} ${linkPadding} ${
                  isActive ? 'bg-white/20 text-white shadow-inner' : 'text-white/90 hover:bg-white/10'
                }`
              }
            >
              <i className={`ti ${item.icon}`} style={{ fontSize: '18px', minWidth: '20px' }} aria-hidden="true" />
              {!collapsed ? <span>{item.label}</span> : null}
            </NavLink>
          ))}
        </nav>
      </PortalSidebarShell>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-neutral-100">
        <OfflineBanner />
        <div className="shrink-0 border-b border-neutral-200 bg-white px-4 py-3 md:px-8">
          <AdminAccessBadge displayName={adminName} />
        </div>
        {children}
      </div>
    </div>
  )
}
