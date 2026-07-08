import { NavLink } from 'react-router-dom'
import Header from '../../components/Header.jsx'
import PortalSidebarShell from '../../components/PortalSidebarShell.jsx'
import { useSidebarCollapsed, SIDEBAR_COLLAPSED_KEYS } from '../../hooks/useSidebarCollapsed.js'

const studentNavItems = [
  { label: 'Dashboard', to: '/student/dashboard', icon: 'ti-home', end: true },
  { label: 'Subjects', to: '/student/subjects', icon: 'ti-book' },
  { label: 'Assignments', to: '/student/assignments', icon: 'ti-file-text' },
  { label: 'Activities', to: '/student/activities', icon: 'ti-clipboard' },
  { label: 'Quizzes', to: '/student/quizzes', icon: 'ti-pencil' },
  { label: 'Announcements', to: '/student/announcements', icon: 'ti-bell' },
]

const studentLegalItems = [
  { label: 'Study Materials', to: '/student/study-materials', icon: 'ti-books', lockable: true },
  { label: 'Terms & Conditions', to: '/student/terms', icon: 'ti-file-description', lockable: false },
]

function lockedClass(locked) {
  return locked ? 'pointer-events-none opacity-40 cursor-not-allowed' : ''
}

export default function StudentSidebar({ onLogout, navLocked = false }) {
  const { collapsed, toggleCollapsed } = useSidebarCollapsed(SIDEBAR_COLLAPSED_KEYS.student)

  const baseLinkClass =
    'flex items-center rounded-lg text-sm font-medium transition'
  const linkPadding = collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'

  const footerLinkClass =
    'flex w-full items-center rounded-lg text-sm font-medium text-white/90 transition'
  const footerPadding = collapsed ? 'justify-center px-2 py-2.5' : 'justify-center gap-2 px-3 py-2.5'

  return (
    <PortalSidebarShell
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      header={<Header collapsed={collapsed} portalLabel="Student" />}
      footer={
        <div className="shrink-0 border-t border-white/15 px-2 py-4 text-center text-white/85">
          {!collapsed ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Legal center</p>
          ) : null}
          {studentLegalItems.map((item, idx) => {
            const marginTop = idx === 0 && !collapsed ? 'mt-2' : collapsed ? 'mt-0.5' : 'mt-0.5'
            const locked = navLocked && item.lockable !== false
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                aria-label={item.label}
                aria-disabled={locked || undefined}
                tabIndex={locked ? -1 : undefined}
                onClick={locked ? (e) => e.preventDefault() : undefined}
                className={({ isActive }) =>
                  `${footerLinkClass} ${footerPadding} ${marginTop} ${lockedClass(locked)} ${
                    isActive ? 'bg-white/20 text-white shadow-inner' : 'hover:bg-white/10'
                  }`
                }
              >
                <i className={`ti ${item.icon}`} style={{ fontSize: '18px', minWidth: '20px' }} aria-hidden="true" />
                {!collapsed ? <span>{item.label}</span> : null}
              </NavLink>
            )
          })}
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
        {studentNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            title={item.label}
            aria-label={item.label}
            aria-disabled={navLocked || undefined}
            tabIndex={navLocked ? -1 : undefined}
            onClick={navLocked ? (e) => e.preventDefault() : undefined}
            className={({ isActive }) =>
              `${baseLinkClass} ${linkPadding} ${lockedClass(navLocked)} ${
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
  )
}
