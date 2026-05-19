import { NavLink } from 'react-router-dom'
import Header from '../../components/Header.jsx'
import { SIDEBAR_GOLD, SIDEBAR_GOLD_DARK } from './instituteChrome.js'

/**
 * Mirrors `InstituteDashboard.jsx` aside chrome (spacing, typography, hover/active,
 * footer) with Tabler glyphs for faculty routes — see admin sidebar aside ~2722–2778.
 */
const teacherNavItems = [
  { label: 'Dashboard', to: '/teacher/dashboard', icon: 'ti-home' },
  { label: 'Curriculum', to: '/teacher/curriculum', icon: 'ti-book' },
  { label: 'Sections', to: '/teacher/sections', icon: 'ti-users' },
  { label: 'Subjects', to: '/teacher/subjects', icon: 'ti-file-text' },
  { label: 'Assignments', to: '/teacher/assignments', icon: 'ti-calendar' },
  { label: 'Activities', to: '/teacher/activities', icon: 'ti-pencil' },
  { label: 'Announcements', to: '/teacher/announcements', icon: 'ti-bell' },
  { label: 'Quiz Maker', to: '/teacher/quizzes', icon: 'ti-list-check' },
]

const navItemLayoutStyle = {
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
}

const teacherLegalItems = [
  { label: 'Study Materials', to: '/teacher/study-materials' },
  { label: 'Terms & Condition', to: '/teacher/terms' },
]

export default function TeacherSidebar({ onLogout, navLocked = false }) {
  const baseLinkClass =
    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition'

  return (
    <aside
      className="flex h-full min-h-0 w-56 shrink-0 flex-col overflow-hidden text-white md:w-60"
      style={{
        background: `linear-gradient(180deg, ${SIDEBAR_GOLD} 0%, ${SIDEBAR_GOLD_DARK} 100%)`,
      }}
    >
      <Header />

      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-4">
        {teacherNavItems.map((item) => {
          const body = (
            <>
              <i
                className={`ti ${item.icon}`}
                style={{ fontSize: '18px', minWidth: '20px' }}
                aria-hidden="true"
              />
              <span>{item.label}</span>
            </>
          )

          if (navLocked) {
            return (
              <span
                key={item.to}
                style={navItemLayoutStyle}
                className={`${baseLinkClass} opacity-70 hover:bg-white/10 text-white/90 cursor-not-allowed pointer-events-none`}
                aria-disabled="true"
                title={
                  item.to === '/teacher/dashboard'
                    ? 'Accept Terms and Conditions to use the dashboard'
                    : undefined
                }
              >
                {body}
              </span>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/teacher/dashboard'}
              style={navItemLayoutStyle}
              className={({ isActive }) =>
                `${baseLinkClass} ${
                  isActive ? 'bg-white/20 text-white shadow-inner' : 'text-white/90 hover:bg-white/10'
                }`
              }
            >
              {body}
            </NavLink>
          )
        })}
      </nav>

      <div className="shrink-0 border-t border-white/15 px-2 py-4 text-center text-white/85">
        <p className="text-xs font-semibold uppercase tracking-wider text-white/70">Legal center</p>

        {teacherLegalItems.map((item, idx) => {
          const body = <span>{item.label}</span>
          const footerBase =
            'flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 transition'
          const marginTop = idx === 0 ? 'mt-2' : 'mt-0.5'

          if (navLocked) {
            return (
              <span
                key={item.to}
                className={`${footerBase} ${marginTop} opacity-70 cursor-not-allowed pointer-events-none`}
                aria-disabled="true"
              >
                {body}
              </span>
            )
          }

          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `${footerBase} ${marginTop} ${
                  isActive ? 'bg-white/20 text-white shadow-inner' : 'hover:bg-white/10'
                }`
              }
            >
              {body}
            </NavLink>
          )
        })}

        <button
          type="button"
          onClick={onLogout}
          className="mt-0.5 flex w-full items-center justify-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/90 transition hover:bg-white/10"
        >
          Logout
        </button>
        <p className="mt-3 px-1 text-xs leading-relaxed text-white/60">
          © {new Date().getFullYear()} LENLEARN LMS. ALL RIGHTS RESERVED.
        </p>
      </div>
    </aside>
  )
}
