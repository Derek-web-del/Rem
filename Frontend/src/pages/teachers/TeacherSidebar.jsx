import { NavLink } from 'react-router-dom'
import Header from '../../components/Header.jsx'
import PortalSidebarShell from '../../components/PortalSidebarShell.jsx'
import { useSidebarCollapsed, SIDEBAR_COLLAPSED_KEYS } from '../../hooks/useSidebarCollapsed.js'

const teacherNavItems = [
  { label: 'Dashboard', to: '/teacher/dashboard', icon: 'ti-home' },
  { label: 'Curriculum', to: '/teacher/curriculum', icon: 'ti-book' },
  { label: 'Sections', to: '/teacher/sections', icon: 'ti-users' },
  { label: 'Subjects', to: '/teacher/subjects', icon: 'ti-file-text' },
  { label: 'Assignments', to: '/teacher/assignments', icon: 'ti-calendar' },
  { label: 'Activities', to: '/teacher/activities', icon: 'ti-pencil' },
  { label: 'Announcements', to: '/teacher/announcements', icon: 'ti-bell' },
  { label: 'Quiz Maker', to: '/teacher/quizzes', icon: 'ti-list-check' },
  { label: 'Grades', to: '/teacher/grades', icon: 'ti-chart-bar' },
  { label: 'AI-Checker', to: '/teacher/originality-checker', icon: 'ti-shield-check' },
]

const teacherLegalItems = [
  { label: 'Study Materials', to: '/teacher/study-materials', icon: 'ti-books' },
  { label: 'Terms & Conditions', to: '/teacher/terms', icon: 'ti-file-description' },
]

export default function TeacherSidebar({ onLogout, navLocked: _navLocked = false }) {
  const { collapsed, toggleCollapsed } = useSidebarCollapsed(SIDEBAR_COLLAPSED_KEYS.teacher)

  const baseLinkClass =
    'flex items-center rounded-lg text-sm font-medium transition'
  const linkPadding = collapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2.5'

  const footerLinkClass =
    'flex w-full items-center rounded-lg text-sm font-medium text-white/90 transition'
  const footerPadding = collapsed ? 'justify-center px-2 py-2.5' : 'justify-center gap-3 px-3 py-2.5'

  return (
    <PortalSidebarShell
      collapsed={collapsed}
      onToggle={toggleCollapsed}
      header={<Header collapsed={collapsed} portalLabel="Faculty" />}
      footer={
        <div className="shrink-0 border-t border-white/15 px-2 py-4 text-center text-white/85">
          {!collapsed ? (
            <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Legal center</p>
          ) : null}
          {teacherLegalItems.map((item, idx) => {
            const marginTop = idx === 0 && !collapsed ? 'mt-2' : 'mt-0.5'
            return (
              <NavLink
                key={item.to}
                to={item.to}
                title={item.label}
                aria-label={item.label}
                className={({ isActive }) =>
                  `${footerLinkClass} ${footerPadding} ${marginTop} ${
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
        {teacherNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/teacher/dashboard'}
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
  )
}
